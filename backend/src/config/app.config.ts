import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 应用基础配置服务
 * 封装通用配置读取，提供类型安全和语义化的访问方式
 * 所有模块应注入 AppConfig 而非直接注入 ConfigService
 */
@Injectable()
export class AppConfig {
  constructor(private readonly configService: ConfigService) {}

  // ====================== 基础环境 ======================
  get env(): string {
    return this.configService.get<string>('NODE_ENV', 'production');
  }

  get isDev(): boolean {
    return this.env === 'development';
  }

  get isProd(): boolean {
    return this.env === 'production';
  }

  get port(): number {
    return this.configService.get<number>('PORT', 3001);
  }

  get host(): string {
    return this.configService.get<string>('HOST', '0.0.0.0');
  }

  /** API 全局前缀（如 /api 或 /v1） */
  get apiPrefix(): string {
    return this.configService.get<string>('API_PREFIX', 'api');
  }

  
  // ====================== 前端跨域 ======================
  get frontendDomain(): string {
    const domain = this.configService.get<string>('FRONTEND_DOMAIN');
    if (!domain && this.isProd) {
      throw new Error('FRONTEND_DOMAIN is required in production');
    }
    return domain;
  }

  // ====================== JWT 认证 ======================
  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET');
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '7d');
  }

  get<T>(key: string, defaultValue?: T): T {
    return this.configService.get<T>(key, defaultValue);
  }
  
  // ====================== Supabase ======================
  get supabase() {
    return {
      url: this.configService.get<string>('SUPABASE_URL'),
      key: this.configService.get<string>('SUPABASE_KEY'),
    };
  }

  // ====================== 日志配置（供 main.ts 使用） ======================
  get nestLoggerLevels(): string[] {
    return this.isProd
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'];
  }
}

/**
 * 在模块中注册 AppConfig（推荐在 CommonModule 中全局注册）
 */
export const appConfigProvider = {
  provide: AppConfig,
  useFactory: (configService: ConfigService) => new AppConfig(configService),
  inject: [ConfigService],
};