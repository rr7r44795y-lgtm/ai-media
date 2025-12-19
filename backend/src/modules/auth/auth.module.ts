/**
 * 认证模块配置
 * 路径：backend/src/modules/auth/auth.module.ts
 * 集成JWT、Passport、Supabase等核心依赖，统一管理认证相关组件
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.contronller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SupabaseConfig, registerSupabaseConfig } from 'src/config/supabase.config';

@Module({
  // 导入依赖模块
  imports: [
    // 1. Passport鉴权模块（默认使用JWT策略）
    PassportModule.register({ 
      defaultStrategy: 'jwt',
      session: false // 禁用session，纯JWT认证
    }),

    // 2. JWT模块（异步加载配置，支持多环境）
    JwtModule.registerAsync({
      inject: [ConfigService], // 注入配置服务
      useFactory: (configService: ConfigService) => ({
        // JWT签名密钥（优先从环境变量读取，兜底值仅用于开发环境）
        secret: configService.get<string>('JWT_SECRET', 'dev-jwt-secret-key-2025'),
        // 默认签名选项
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '2h'), // 访问令牌过期时间
        },
      }),
    }),

    // 3. 配置模块（全局已注册可省略，此处显式导入确保兼容性）
    ConfigModule,
  ],

  // 注册控制器
  controllers: [AuthController],

  // 注册服务和策略
  providers: [
    AuthService,          // 认证核心服务
    JwtStrategy,          // JWT认证策略
    SupabaseConfig,       // Supabase配置服务
    registerSupabaseConfig(), // Supabase自定义注册函数
  ],

  // 导出核心组件供其他模块使用
  exports: [
    JwtStrategy,          // 导出JWT策略
    PassportModule,       // 导出Passport模块（支持@UseGuards(AuthGuard)）
    AuthService,          // 导出认证服务（供其他模块调用）
  ],
})
export class AuthModule {}