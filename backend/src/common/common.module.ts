import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

// 通用拦截器
import { LoggerInterceptor } from './interceptors/logger.interceptor';
import { ResponseFormatInterceptor } from './interceptors/response-format.interceptor';
// 通用管道
import { ValidationPipe } from './pipes/validation.pipe';
// 通用工具（提供全局实例）
import { AppConfig } from '../config/app.config';
import { initEncryptionUtil } from './until/encryption';
import { initGlobalLogger } from './until/logger';
/**
 * 通用模块
 * 1. 全局注册通用拦截器/管道/守卫
 * 2. 初始化全局工具（日志/加密）
 * 3. 提供通用配置/工具的依赖注入
 */
import { AppConfigModule } from 'src/config/config.module';
@Global() // 全局模块，其他模块无需导入即可使用
@Module({
  imports: [
    // 导入配置模块（按需）
    AppConfigModule,
  ],
  providers: [
    // 配置服务（全局可用）
    AppConfig,

    // 全局拦截器 - 日志拦截器（先执行）
    {
      provide: APP_INTERCEPTOR,
      useFactory: (appConfig: AppConfig) => {
        // 初始化全局日志工具
        initGlobalLogger(appConfig);
        return new LoggerInterceptor(appConfig);
      },
      inject: [AppConfig],
    },

    // 全局拦截器 - 响应格式化拦截器（后执行）
    {
      provide: APP_INTERCEPTOR,
      useFactory: (appConfig: AppConfig) => {
        return new ResponseFormatInterceptor(appConfig);
      },
      inject: [AppConfig],
    },

    // 全局管道 - 参数校验管道
    {
      provide: APP_PIPE,
      useFactory: (appConfig: AppConfig) => {
        // 初始化加密工具
        initEncryptionUtil(appConfig);
        return new ValidationPipe(appConfig);
      },
      inject: [AppConfig],
    },
  ],
  // 导出通用服务（其他模块可注入使用）
  exports: [
    AppConfig,
  ],
})
export class CommonModule {
  // 模块初始化时执行（可选，用于初始化全局工具）
  constructor(private readonly appConfig: AppConfig) {
    // 兜底初始化（防止工厂函数未执行）
    if (!global.globalLogger) {
      initGlobalLogger(this.appConfig);
    }
    if (!global.encryptionUtil) {
      initEncryptionUtil(this.appConfig);
    }
  }
}