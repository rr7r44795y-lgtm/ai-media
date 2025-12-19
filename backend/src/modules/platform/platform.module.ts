/**
 * 社交平台集成模块配置
 * 路径：platform/platform.module.ts
 * 统一注册模块内所有组件，管理依赖注入，导出核心能力供其他模块使用
 */
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios'; // 适配HTTP请求（可选）

// 控制器
import { PlatformController } from './platform.controller';

// 服务
import { PlatformService } from './platform.service';

// 适配器
import { FacebookAdapter } from './adapters/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { YoutubeAdapter } from './adapters/youtube.adapter';
import { LinkedinAdapter } from './adapters/linkedin.adapter';

// 实体
import { SocialAccountEntity } from './entities/social-account.entity';

/**
 * 平台集成模块
 * @description 全局模块（可选），若需在其他模块无需导入即可使用，可添加@Global()装饰器
 */
// @Global() // 如需全局共享，取消注释
@Module({
  /**
   * 导入依赖模块
   * - ConfigModule：配置模块，读取.env环境变量
   * - TypeOrmModule.forFeature：注册当前模块使用的TypeORM实体
   * - HttpModule：NestJS封装的Axios模块（可选，适配器若使用可导入）
   */
  imports: [
    // 导入配置模块（支持全局使用）
    ConfigModule.forRoot({
      isGlobal: false, // 设为true则全局可用，false则仅当前模块
      envFilePath: ['.env'], // 环境变量文件路径
    }),

    // 注册TypeORM实体（仅当前模块可用）
    TypeOrmModule.forFeature([SocialAccountEntity]),

    // 导入HTTP模块（适配适配器的HTTP请求，可选配置超时/拦截器）
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: 30000, // 全局HTTP超时时间（毫秒）
        maxRedirects: 5, // 最大重定向次数
        // 可选：添加默认请求头
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      inject: [ConfigService],
    }),
  ],

  /**
   * 注册控制器
   * - 暴露模块的API接口
   */
  controllers: [PlatformController],

  /**
   * 注册提供者（服务/适配器/工厂等）
   * - 模块内可注入使用
   */
  providers: [
    // 核心服务
    PlatformService,

    // 各平台适配器
    FacebookAdapter,
    InstagramAdapter,
    YoutubeAdapter,
    LinkedinAdapter,

    // 可选：适配器工厂（如需动态创建适配器，可添加）
    // {
    //   provide: 'PLATFORM_ADAPTER_FACTORY',
    //   useFactory: (
    //     fbAdapter: FacebookAdapter,
    //     igAdapter: InstagramAdapter,
    //     ytAdapter: YoutubeAdapter,
    //     liAdapter: LinkedinAdapter,
    //   ) => {
    //     return (platform: string) => {
    //       switch (platform) {
    //         case 'facebook': return fbAdapter;
    //         case 'instagram': return igAdapter;
    //         case 'youtube': return ytAdapter;
    //         case 'linkedin': return liAdapter;
    //         default: throw new Error(`不支持的平台：${platform}`);
    //       }
    //     };
    //   },
    //   inject: [FacebookAdapter, InstagramAdapter, YoutubeAdapter, LinkedinAdapter],
    // },
  ],

  /**
   * 导出提供者
   * - 供其他模块导入使用（如AppModule、ContentModule等）
   */
  exports: [
    // 导出TypeORM模块（其他模块可注入SocialAccountEntity的Repository）
    TypeOrmModule,

    // 导出核心服务
    PlatformService,

    // 导出各平台适配器
    FacebookAdapter,
    InstagramAdapter,
    YoutubeAdapter,
    LinkedinAdapter,

    // 可选：导出适配器工厂
    // 'PLATFORM_ADAPTER_FACTORY',
  ],
})
export class PlatformModule {}