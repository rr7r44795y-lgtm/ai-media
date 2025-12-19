import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

// ====================== 配置加载 ======================
import * as Joi from 'joi'; // 环境变量验证

// ====================== 数据库模块 ======================
// 根据实际使用的数据库选择导入
// 方案1: TypeORM
// import { TypeOrmModule } from '@nestjs/typeorm';
// 方案2: Prisma
// import { PrismaModule } from './prisma/prisma.module';
// 方案3: Supabase (自定义模块)
import { SupabaseModule } from './database/supabase.module';

// ====================== 通用模块 ======================
import { CommonModule } from './common/common.module';

// ====================== 全局提供者 ======================
import { AuthGuard } from './common/guards/auth.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggerInterceptor } from './common/interceptors/logger.interceptor';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';

// ====================== 业务模块 ======================
import { AuthModule } from './modules/auth/auth.module';
import { ContentModule } from './modules/content/content.module';
import { ScheduleModule as BusinessScheduleModule } from './modules/schedule/schedule.module'; // 改名避免冲突
import { PlatformModule } from './modules/platform/platform.module';
import { BillingModule } from './modules/billing/billing.module';
import { CronModule } from './modules/cron/cron.module';

// ====================== 健康检查模块（可选） ======================
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // ==================== 1. 核心配置模块 ====================
    ConfigModule.forRoot({
      isGlobal: true, // 全局可用，所有模块可通过 ConfigService 访问
      envFilePath: [
        `.env.${process.env.NODE_ENV}`, // 优先加载环境特定配置
        '.env', // 回退到默认配置
      ],
      ignoreEnvFile: process.env.NODE_ENV === 'production', // 生产环境使用系统环境变量
      
      // 环境变量验证（防止启动时缺少关键配置）
      validationSchema: Joi.object({
        // 应用配置
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('production'),
        PORT: Joi.number().default(3001),
        HOST: Joi.string().default('0.0.0.0'),
        
        // 前端域名
        FRONTEND_DOMAIN: Joi.string().required(),
        
        // 数据库配置（根据实际使用调整）
        DATABASE_URL: Joi.string().required(),
        SUPABASE_URL: Joi.string().uri().optional(),
        SUPABASE_KEY: Joi.string().optional(),
        
        // JWT 配置
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('7d'),
        
        // 第三方 API（根据实际需求添加）
        // OPENAI_API_KEY: Joi.string().required(),
        // STRIPE_SECRET_KEY: Joi.string().required(),
      }),
      
      // 环境变量扩展（支持嵌套配置）
      expandVariables: true,
    }),

    // ==================== 2. 定时任务模块 ====================
    ScheduleModule.forRoot(),

    // ==================== 3. 数据库模块 ====================
    // 选择以下方案之一：
    
    // 方案 A: Supabase（推荐用于 Render + Vercel 架构）
    SupabaseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        url: configService.get<string>('SUPABASE_URL'),
        key: configService.get<string>('SUPABASE_KEY'),
      }),
      inject: [ConfigService],
    }),
    // ==================== 4. 通用模块 ====================
    CommonModule,

    // ==================== 5. 业务模块 ====================
    AuthModule,
    ContentModule,
    BusinessScheduleModule, // 用户日程管理
    PlatformModule,
    BillingModule,
    CronModule, // 定时任务业务逻辑

    // ==================== 6. 健康检查模块（Render 必需） ====================
    TerminusModule,
    HttpModule, // Terminus 依赖
  ],

  // ==================== 全局提供者 ====================
  providers: [
    // 1. 全局认证守卫
    // 注意：所有接口默认需要认证，使用 @Public() 装饰器豁免
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },

    // 2. 全局异常过滤器
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // 3. 全局日志拦截器（先执行）
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },

    // 4. 全局响应格式化拦截器（后执行）
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseFormatInterceptor,
    },

    // 注意：ValidationPipe 应在 main.ts 中通过 app.useGlobalPipes() 配置
    // 避免在此处重复注册
  ],

  // ==================== 健康检查控制器 ====================
  controllers: [
    // 如果创建了 HealthController，在此注册
    HealthController,
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    // 启动时验证关键配置（可选）
    this.validateConfiguration();
  }

  private validateConfiguration() {
    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'FRONTEND_DOMAIN',
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !this.configService.get(varName),
    );

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}`,
      );
    }
  }
}