/**
 * 订阅套餐相关类型定义 & NestJS 校验 DTO
 * 路径：backend/src/modules/billing/dto/subscribe-plan.ts
 * 适配前后端分离架构：后端用于参数校验，前端可复用类型定义
 */
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsBoolean,
  ValidateIf,
  Matches,
  Length,
} from 'class-validator';

// ===================== 枚举类型（前后端共用）=====================
/**
 * 套餐类型枚举
 */
export enum PlanType {
  FREE = 'free', // 免费版
  BASIC = 'basic', // 基础版
  PRO = 'pro', // 专业版
  ENTERPRISE = 'enterprise', // 企业版
}

/**
 * 计费周期枚举
 */
export enum BillingCycle {
  MONTHLY = 'monthly', // 月付
  YEARLY = 'yearly', // 年付（享折扣）
  QUARTERLY = 'quarterly', // 季付
}

/**
 * 支付方式枚举
 */
export enum PaymentMethod {
  CREDIT_CARD = 'credit_card', // 信用卡
  PAYPAL = 'paypal', // PayPal
  STRIPE = 'stripe', // Stripe
  BANK_TRANSFER = 'bank_transfer', // 银行转账
}

/**
 * 订阅状态枚举（用于查询/返回）
 */
export enum SubscriptionStatus {
  ACTIVE = 'active', // 活跃
  CANCELED = 'canceled', // 已取消
  EXPIRED = 'expired', // 已过期
  PENDING = 'pending', // 待支付
  PAST_DUE = 'past_due', // 逾期未付款
}

// ===================== 后端校验 DTO（NestJS 使用）=====================
/**
 * 订阅套餐DTO（创建订阅）
 * 前端传参 → 后端校验 → 创建订阅订单
 */
export class SubscribePlanDto {
  /**
   * 套餐ID（Supabase plans 表主键，UUID）
   */
  @IsNotEmpty({ message: '套餐ID不能为空' })
  @IsUUID('4', { message: '套餐ID必须为UUID格式' })
  planId: string;

  /**
   * 计费周期
   */
  @IsNotEmpty({ message: '计费周期不能为空' })
  @IsEnum(BillingCycle, {
    message: `计费周期仅支持：${Object.values(BillingCycle).join(', ')}`,
  })
  billingCycle: BillingCycle;

  /**
   * 支付方式
   */
  @IsNotEmpty({ message: '支付方式不能为空' })
  @IsEnum(PaymentMethod, {
    message: `支付方式仅支持：${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod: PaymentMethod;

  /**
   * 支付方式ID（如Stripe支付方式ID，信用卡/Stripe支付时必填）
   */
  @ValidateIf((o) => 
    o.paymentMethod === PaymentMethod.CREDIT_CARD || 
    o.paymentMethod === PaymentMethod.STRIPE
  )
  @IsNotEmpty({ message: '支付方式ID不能为空（信用卡/Stripe支付时）' })
  @IsString({ message: '支付方式ID必须为字符串' })
  paymentMethodId?: string;

  /**
   * 优惠券码（可选）
   */
  @IsOptional()
  @IsString({ message: '优惠券码必须为字符串' })
  @Length(3, 20, { message: '优惠券码长度需在3-20位之间' })
  @Matches(/^[A-Z0-9_-]+$/, { message: '优惠券码仅支持大写字母、数字、下划线和短横线' })
  couponCode?: string;

  /**
   * 是否开启自动续费（默认true）
   */
  @IsOptional()
  @IsBoolean({ message: '自动续费标识必须为布尔值' })
  autoRenew?: boolean = true;

  /**
   * 企业ID（企业版套餐必填）
   */
  @ValidateIf((o) => 
    o.planId.includes('enterprise') || 
    (o.planId as string).endsWith(PlanType.ENTERPRISE)
  )
  @IsNotEmpty({ message: '企业版套餐必须填写企业ID' })
  @IsUUID('4', { message: '企业ID必须为UUID格式' })
  enterpriseId?: string;

  /**
   * 订阅备注（可选）
   */
  @IsOptional()
  @IsString({ message: '订阅备注必须为字符串' })
  @Length(0, 500, { message: '订阅备注长度不能超过500位' })
  note?: string;
}

/**
 * 升级/降级套餐DTO
 */
export class ChangePlanDto {
  /**
   * 当前订阅ID
   */
  @IsNotEmpty({ message: '当前订阅ID不能为空' })
  @IsUUID('4', { message: '订阅ID必须为UUID格式' })
  subscriptionId: string;

  /**
   * 目标套餐ID
   */
  @IsNotEmpty({ message: '目标套餐ID不能为空' })
  @IsUUID('4', { message: '目标套餐ID必须为UUID格式' })
  targetPlanId: string;

  /**
   * 变更生效时间
   */
  @IsNotEmpty({ message: '生效时间不能为空' })
  @IsEnum(['immediate', 'next_cycle'], {
    message: '生效时间仅支持：immediate（立即生效）、next_cycle（下一周期生效）',
  })
  effectiveTime: 'immediate' | 'next_cycle';

  /**
   * 是否保留当前套餐的剩余天数
   */
  @IsOptional()
  @IsBoolean({ message: '保留剩余天数标识必须为布尔值' })
  retainRemainingDays?: boolean = true;

  /**
   * 变更原因（可选）
   */
  @IsOptional()
  @IsString({ message: '变更原因必须为字符串' })
  @Length(0, 500, { message: '变更原因长度不能超过500位' })
  reason?: string;
}

/**
 * 取消订阅DTO
 */
export class CancelSubscriptionDto {
  /**
   * 订阅ID
   */
  @IsNotEmpty({ message: '订阅ID不能为空' })
  @IsUUID('4', { message: '订阅ID必须为UUID格式' })
  subscriptionId: string;

  /**
   * 取消原因
   */
  @IsNotEmpty({ message: '取消原因不能为空' })
  @IsEnum([
    'too_expensive',
    'lack_of_features',
    'poor_service',
    'switched_to_competitor',
    'no_longer_needed',
    'other',
  ], {
    message: '取消原因仅支持：too_expensive、lack_of_features、poor_service、switched_to_competitor、no_longer_needed、other',
  })
  cancelReason: string;

  /**
   * 取消原因详情（可选）
   */
  @IsOptional()
  @IsString({ message: '取消原因详情必须为字符串' })
  @Length(0, 1000, { message: '取消原因详情长度不能超过1000位' })
  cancelReasonDetails?: string;

  /**
   * 是否确认取消（防止误操作）
   */
  @IsNotEmpty({ message: '确认取消标识不能为空' })
  @IsBoolean({ message: '确认取消标识必须为布尔值' })
  confirmCancel: boolean;

  /**
   * 是否希望收到后续优惠通知
   */
  @IsOptional()
  @IsBoolean({ message: '优惠通知标识必须为布尔值' })
  receiveOffers?: boolean = false;
}

/**
 * 续订套餐DTO
 */
export class RenewSubscriptionDto {
  /**
   * 订阅ID
   */
  @IsNotEmpty({ message: '订阅ID不能为空' })
  @IsUUID('4', { message: '订阅ID必须为UUID格式' })
  subscriptionId: string;

  /**
   * 续订的计费周期
   */
  @IsNotEmpty({ message: '续订计费周期不能为空' })
  @IsEnum(BillingCycle, {
    message: `计费周期仅支持：${Object.values(BillingCycle).join(', ')}`,
  })
  billingCycle: BillingCycle;

  /**
   * 支付方式ID
   */
  @IsNotEmpty({ message: '支付方式ID不能为空' })
  @IsString({ message: '支付方式ID必须为字符串' })
  paymentMethodId: string;

  /**
   * 续订数量（默认1）
   */
  @IsOptional()
  @IsNumber({}, { message: '续订数量必须为数字' })
  @Min(1, { message: '续订数量最小为1' })
  @Max(12, { message: '续订数量最大为12' })
  renewCount?: number = 1;

  /**
   * 优惠券码（可选）
   */
  @IsOptional()
  @IsString({ message: '优惠券码必须为字符串' })
  @Length(3, 20, { message: '优惠券码长度需在3-20位之间' })
  @Matches(/^[A-Z0-9_-]+$/, { message: '优惠券码仅支持大写字母、数字、下划线和短横线' })
  couponCode?: string;
}

/**
 * 获取订阅列表DTO（分页+筛选）
 */
export class GetSubscriptionListDto {
  /**
   * 页码（默认1）
   */
  @IsOptional()
  @IsNumber({}, { message: '页码必须为数字' })
  @Min(1, { message: '页码最小为1' })
  page?: number = 1;

  /**
   * 每页条数（默认10）
   */
  @IsOptional()
  @IsNumber({}, { message: '每页条数必须为数字' })
  @Min(1, { message: '每页条数最小为1' })
  @Max(50, { message: '每页条数最大为50' })
  pageSize?: number = 10;

  /**
   * 订阅状态筛选（可选）
   */
  @IsOptional()
  @IsEnum(SubscriptionStatus, {
    message: `订阅状态仅支持：${Object.values(SubscriptionStatus).join(', ')}`,
  })
  status?: SubscriptionStatus;

  /**
   * 套餐类型筛选（可选）
   */
  @IsOptional()
  @IsEnum(PlanType, {
    message: `套餐类型仅支持：${Object.values(PlanType).join(', ')}`,
  })
  planType?: PlanType;
}

// ===================== 前端/后端共用的返回类型（TypeScript）=====================
/**
 * 套餐信息返回类型
 */
export interface PlanInfo {
  id: string; // 套餐ID
  name: string; // 套餐名称
  type: PlanType; // 套餐类型
  price: {
    monthly: number; // 月付价格
    yearly: number; // 年付价格
    quarterly: number; // 季付价格
  };
  features: string[]; // 套餐包含功能
  maxUsers: number; // 最大用户数
  maxProjects: number; // 最大项目数
  isActive: boolean; // 是否启用
}

/**
 * 订阅信息返回类型
 */
export interface SubscriptionInfo {
  id: string; // 订阅ID
  userId: string; // 用户ID
  planId: string; // 套餐ID
  planInfo: PlanInfo; // 套餐详情
  billingCycle: BillingCycle; // 计费周期
  status: SubscriptionStatus; // 订阅状态
  startDate: string; // 开始时间（ISO格式）
  endDate: string; // 结束时间（ISO格式）
  autoRenew: boolean; // 是否自动续费
  amount: number; // 订阅金额
  paymentMethod: PaymentMethod; // 支付方式
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
}

/**
 * 账单信息返回类型
 */
export interface InvoiceInfo {
  id: string; // 账单ID
  subscriptionId: string; // 订阅ID
  userId: string; // 用户ID
  amount: number; // 金额
  status: 'pending' | 'paid' | 'failed'; // 账单状态
  billingCycle: BillingCycle; // 计费周期
  issueDate: string; // 开具时间
  dueDate: string; // 到期时间
  paymentMethod: PaymentMethod; // 支付方式
  receiptUrl?: string; // 收据链接（可选）
}