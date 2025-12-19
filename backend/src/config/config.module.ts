import { Module } from '@nestjs/common';
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config';
import * as Joi from 'joi';
// 各配置类及注册函数导入
import { AppConfig, appConfigProvider, } from './app.config';
import { OAuthConfig, registerOAuthConfig } from './oauth.config';
import { StripeConfig, registerStripeConfig } from './stripe.config';
import { SupabaseConfig, registerSupabaseConfig } from './supabase.config';

/**
 * 全局环境变量校验规则
 * 覆盖所有第三方服务/应用配置，确保Render部署时必填项已配置
 * 校验失败时应用启动直接报错，提前暴露配置问题
 */
export const envValidationSchema = Joi.object({
  // ====================== 基础应用配置 ======================
  NODE_ENV: Joi.string().valid('development', 'production').default('production'),
  PORT: Joi.number().default(3001),
  HOST: Joi.string().default('0.0.0.0'),
  FRONTEND_DOMAIN: Joi.string().required(), // 前端Vercel域名
  BACKEND_DOMAIN: Joi.string().required(), // 后端Render域名（OAuth回调用）
  // JWT认证配置
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('2h'),
  // 接口限流配置
  RATE_LIMIT_WINDOW: Joi.number().default(60 * 1000),
  RATE_LIMIT_MAX: Joi.number().default(100),

  // ====================== Supabase配置 ======================
  SUPABASE_URL: Joi.string().required(),
  SUPABASE_ANON_KEY: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_BUCKET_CONTENT: Joi.string().default('content-library'),
  SUPABASE_BUCKET_AVATAR: Joi.string().default('user-avatars'),
  SUPABASE_MAX_FILE_SIZE: Joi.number().default(10 * 1024 * 1024), // 10MB
  SUPABASE_AVATAR_MAX_SIZE: Joi.number().default(2 * 1024 * 1024), // 2MB
  SUPABASE_REAL_TIME_CHANNEL: Joi.string().default('schedule-updates'),

  // ====================== Stripe支付配置 ======================
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  STRIPE_API_VERSION: Joi.string().default('2024-06-20'),
  STRIPE_PRICE_ID_FREE: Joi.string().allow(''),
  STRIPE_PRICE_ID_BASIC: Joi.string().required(),
  STRIPE_PRICE_ID_PRO: Joi.string().required(),
  STRIPE_PRICE_ID_ENTERPRISE: Joi.string().required(),

  // ====================== OAuth社交平台配置 ======================
  // Instagram/Facebook（共用一套应用配置）
  INSTAGRAM_CLIENT_ID: Joi.string().required(),
  INSTAGRAM_CLIENT_SECRET: Joi.string().required(),
  FACEBOOK_CLIENT_ID: Joi.string().required(),
  FACEBOOK_CLIENT_SECRET: Joi.string().required(),
  // LinkedIn
  LINKEDIN_CLIENT_ID: Joi.string().required(),
  LINKEDIN_CLIENT_SECRET: Joi.string().required(),
  // YouTube
  YOUTUBE_CLIENT_ID: Joi.string().required(),
  YOUTUBE_CLIENT_SECRET: Joi.string().required(),
});

/**
 * ConfigModule核心配置项
 * 全局生效，加载.env文件并校验环境变量
 */
export const configModuleOptions: ConfigModuleOptions = {
  isGlobal: true, // 全局模块，所有业务模块无需重复导入
  envFilePath: ['.env', '.env.production'], // 优先加载本地.env，生产环境用Render变量覆盖
  validationSchema: envValidationSchema,
  validationOptions: {
    abortEarly: false, // 校验失败时返回所有错误（而非第一个），便于排查
    allowUnknown: false, // 禁止未知环境变量，避免配置拼写错误
  },
};

/**
 * 全局配置模块
 * 统一注册所有配置类，导出后供全应用注入使用
 */
@Module({
  imports: [ConfigModule.forRoot(configModuleOptions)],
  providers: [
    appConfigProvider, // 应用基础配置
    registerOAuthConfig(), // OAuth社交平台配置
    registerStripeConfig(), // Stripe支付配置
    registerSupabaseConfig(), // Supabase存储/数据库配置
  ],
  exports: [
    AppConfig,
    OAuthConfig,
    StripeConfig,
    SupabaseConfig,
  ], // 导出所有配置类，业务模块可直接注入
})
export class AppConfigModule {}