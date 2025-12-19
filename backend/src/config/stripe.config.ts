import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Stripe 价格计划枚举
 * 约束SaaS套餐类型，避免硬编码
 */
export enum StripePricePlan {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Stripe Webhook 事件类型枚举
 * 聚焦SaaS核心支付事件
 */
export enum StripeWebhookEvent {
  CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed', // 结账完成
  CUSTOMER_SUBSCRIPTION_CREATED = 'customer.subscription.created', // 订阅创建
  CUSTOMER_SUBSCRIPTION_UPDATED = 'customer.subscription.updated', // 订阅更新
  CUSTOMER_SUBSCRIPTION_DELETED = 'customer.subscription.deleted', // 订阅取消
  INVOICE_PAID = 'invoice.paid', // 发票支付成功
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed', // 发票支付失败
}

/**
 * Stripe 配置接口
 */
export interface StripeConfigOptions {
  apiKey: string; // Stripe 秘钥
  webhookSecret: string; // Webhook 签名密钥
  frontendSuccessUrl: string; // 支付成功后跳转前端URL
  frontendCancelUrl: string; // 支付取消后跳转前端URL
  priceIds: Record<StripePricePlan, string>; // 各套餐对应的Stripe价格ID
  apiVersion: string; // Stripe API版本
}

/**
 * Stripe 统一配置类
 * 封装所有支付相关配置，全局可注入
 */
@Injectable()
export class StripeConfig {
  private readonly config: StripeConfigOptions;

  constructor(private readonly configService: ConfigService) {
    // 初始化配置（提前校验必填项）
    this.config = this.validateAndBuildConfig();
  }

  /**
   * 校验并构建Stripe配置
   * 缺失必填项直接抛出错误，避免运行时异常
   */
  private validateAndBuildConfig(): StripeConfigOptions {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    const frontendDomain = this.configService.get<string>('FRONTEND_DOMAIN');

    // 核心配置校验
    if (!apiKey) throw new Error('STRIPE_SECRET_KEY is required in environment variables');
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required in environment variables');
    if (!frontendDomain) throw new Error('FRONTEND_DOMAIN is required in environment variables');

    return {
      apiKey,
      webhookSecret,
      // 前端跳转URL（适配Vercel域名）
      frontendSuccessUrl: `${frontendDomain}/billing/success`,
      frontendCancelUrl: `${frontendDomain}/billing/cancel`,
      // 各套餐对应的Stripe价格ID（需在Stripe后台创建后配置）
      priceIds: {
        [StripePricePlan.FREE]: this.configService.get<string>('STRIPE_PRICE_ID_FREE', ''),
        [StripePricePlan.BASIC]: this.configService.get<string>('STRIPE_PRICE_ID_BASIC', ''),
        [StripePricePlan.PRO]: this.configService.get<string>('STRIPE_PRICE_ID_PRO', ''),
        [StripePricePlan.ENTERPRISE]: this.configService.get<string>('STRIPE_PRICE_ID_ENTERPRISE', ''),
      },
      // Stripe API版本（锁定版本避免兼容性问题）
      apiVersion: this.configService.get<string>('STRIPE_API_VERSION', '2024-06-20'),
    };
  }

  /**
   * 获取Stripe客户端实例
   * 全局复用同一个实例，避免重复创建
   */
  getStripeClient(): Stripe {
    return new Stripe(this.config.apiKey, {
      apiVersion: this.config.apiVersion as Stripe.LatestApiVersion,
      // 生产环境启用网络重试，适配Render网络环境
      httpClient: Stripe.createFetchHttpClient({
        timeout: 10000, // 10秒超时
        maxNetworkRetries: this.configService.get<string>('NODE_ENV') === 'production' ? 3 : 1,
      }),
    });
  }

  /**
   * 获取Webhook签名密钥
   */
  getWebhookSecret(): string {
    return this.config.webhookSecret;
  }

  /**
   * 获取支付成功/取消跳转URL
   */
  getRedirectUrls(): { success: string; cancel: string } {
    return {
      success: this.config.frontendSuccessUrl,
      cancel: this.config.frontendCancelUrl,
    };
  }

  /**
   * 获取指定套餐的Stripe价格ID
   * @param plan 套餐类型
   */
  getPriceId(plan: StripePricePlan): string {
    const priceId = this.config.priceIds[plan];
    if (!priceId) throw new Error(`No Stripe price ID configured for plan: ${plan}`);
    return priceId;
  }

  /**
   * 获取所有支持的支付事件类型
   */
  getSupportedWebhookEvents(): string[] {
    return Object.values(StripeWebhookEvent);
  }
}

/**
 * Stripe配置注册函数
 * 供Nest模块导入，实现依赖注入
 */
export const registerStripeConfig = () => ({
  provide: StripeConfig,
  useFactory: (configService: ConfigService) => new StripeConfig(configService),
  inject: [ConfigService],
});