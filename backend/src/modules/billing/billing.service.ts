import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SupabaseConfig } from 'src/config/supabase.config';
import {
  SubscribePlanDto,
  ChangePlanDto,
  CancelSubscriptionDto,
  RenewSubscriptionDto,
  GetSubscriptionListDto,
  PlanType,
  SubscriptionStatus,
  BillingCycle,
  PlanInfo,
  SubscriptionInfo,
  InvoiceInfo,
} from './dto/subscribe-plan';

@Injectable()
export class BillingService {
  private readonly supabase;

  constructor(private readonly supabaseConfig: SupabaseConfig) {
    // 初始化Supabase客户端（复用全局配置）
    this.supabase = this.supabaseConfig.getClient();
  }

  /**
   * 订阅套餐核心逻辑
   */
  async subscribePlan(dto: SubscribePlanDto, userId: string): Promise<{
    subscriptionId: string;
    status: SubscriptionStatus;
    paymentUrl?: string;
    amount: number;
  }> {
    try {
      // 1. 查询套餐信息
      const { data: plan, error: planError } = await this.supabase
        .from('plans')
        .select('*')
        .eq('id', dto.planId)
        .single();

      if (planError || !plan) {
        throw new HttpException('套餐不存在', HttpStatus.NOT_FOUND);
      }

      // 2. 计算金额（根据计费周期）
      const amount = plan.price[dto.billingCycle];
      if (!amount) {
        throw new HttpException('该套餐不支持当前计费周期', HttpStatus.BAD_REQUEST);
      }

      // 3. 处理优惠券（如有）
      let finalAmount = amount;
      if (dto.couponCode) {
        const couponValid = await this.validateCoupon(dto.couponCode, dto.planId, userId);
        if (couponValid.valid) {
          finalAmount = amount * (1 - couponValid.discount);
        }
      }

      // 4. 创建订阅记录
      const { data: subscription, error: subError } = await this.supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: dto.planId,
          billing_cycle: dto.billingCycle,
          status: SubscriptionStatus.PENDING,
          amount: finalAmount,
          payment_method: dto.paymentMethod,
          payment_method_id: dto.paymentMethodId,
          auto_renew: dto.autoRenew,
          enterprise_id: dto.enterpriseId,
          note: dto.note,
          start_date: new Date().toISOString(),
          end_date: this.calculateEndDate(dto.billingCycle),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (subError) {
        throw new HttpException(`创建订阅失败：${subError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        subscriptionId: subscription.id,
        status: SubscriptionStatus.PENDING,
        amount: finalAmount,
        // 前端支付链接（根据实际支付方式生成）
        paymentUrl: dto.paymentMethod === 'stripe' ? `/payment/stripe/${subscription.id}` : undefined,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`订阅套餐失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 升级/降级套餐
   */
  async changePlan(dto: ChangePlanDto, userId: string): Promise<SubscriptionInfo> {
    try {
      // 1. 校验目标套餐
      const { data: targetPlan, error: planError } = await this.supabase
        .from('plans')
        .select('*')
        .eq('id', dto.targetPlanId)
        .single();

      if (planError || !targetPlan) {
        throw new HttpException('目标套餐不存在', HttpStatus.NOT_FOUND);
      }

      // 2. 查询当前订阅
      const { data: currentSub, error: subError } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', dto.subscriptionId)
        .eq('user_id', userId)
        .single();

      if (subError || !currentSub) {
        throw new HttpException('订阅记录不存在', HttpStatus.NOT_FOUND);
      }

      // 3. 计算金额差（按需调整）
      const currentAmount = currentSub.amount;
      const targetAmount = targetPlan.price[currentSub.billing_cycle];
      const amountDiff = targetAmount - currentAmount;

      // 4. 更新订阅记录
      const updateData: any = {
        plan_id: dto.targetPlanId,
        amount: targetAmount,
        updated_at: new Date().toISOString(),
      };

      // 立即生效：更新开始/结束时间；下一周期生效：标记待变更
      if (dto.effectiveTime === 'immediate') {
        updateData.start_date = new Date().toISOString();
        updateData.end_date = this.calculateEndDate(currentSub.billing_cycle);
        updateData.status = SubscriptionStatus.ACTIVE;
      } else {
        updateData.pending_plan_id = dto.targetPlanId;
        updateData.pending_effective_time = currentSub.end_date;
      }

      const { data: updatedSub, error: updateError } = await this.supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', dto.subscriptionId)
        .select('*')
        .single();

      if (updateError) {
        throw new HttpException(`更新订阅失败：${updateError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 5. 构建返回结果
      return {
        id: updatedSub.id,
        userId: updatedSub.user_id,
        planId: updatedSub.plan_id,
        planInfo: targetPlan as PlanInfo,
        billingCycle: updatedSub.billing_cycle as BillingCycle,
        status: updatedSub.status as SubscriptionStatus,
        startDate: updatedSub.start_date,
        endDate: updatedSub.end_date,
        autoRenew: updatedSub.auto_renew,
        amount: updatedSub.amount,
        paymentMethod: updatedSub.payment_method,
        createdAt: updatedSub.created_at,
        updatedAt: updatedSub.updated_at,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`变更套餐失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 取消订阅
   */
  async cancelSubscription(dto: CancelSubscriptionDto, userId: string): Promise<void> {
    try {
      // 1. 更新订阅状态
      const { error } = await this.supabase
        .from('subscriptions')
        .update({
          status: SubscriptionStatus.CANCELED,
          cancel_reason: dto.cancelReason,
          cancel_reason_details: dto.cancelReasonDetails,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dto.subscriptionId)
        .eq('user_id', userId);

      if (error) {
        throw new HttpException(`取消订阅失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`取消订阅失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 续订套餐
   */
  async renewSubscription(dto: RenewSubscriptionDto, userId: string): Promise<SubscriptionInfo> {
    try {
      // 1. 查询当前订阅
      const { data: currentSub, error: subError } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('id', dto.subscriptionId)
        .eq('user_id', userId)
        .single();

      if (subError || !currentSub) {
        throw new HttpException('订阅记录不存在', HttpStatus.NOT_FOUND);
      }

      // 2. 查询套餐信息
      const { data: plan, error: planError } = await this.supabase
        .from('plans')
        .select('*')
        .eq('id', currentSub.plan_id)
        .single();

      if (planError || !plan) {
        throw new HttpException('套餐不存在', HttpStatus.NOT_FOUND);
      }

      // 3. 计算续订金额
      let amount = plan.price[dto.billingCycle] * dto.renewCount;
      if (dto.couponCode) {
        const couponValid = await this.validateCoupon(dto.couponCode, currentSub.plan_id, userId);
        if (couponValid.valid) {
          amount = amount * (1 - couponValid.discount);
        }
      }

      // 4. 更新订阅结束时间和金额
      const newEndDate = this.calculateRenewEndDate(currentSub.end_date, dto.billingCycle, dto.renewCount);
      const { data: updatedSub, error: updateError } = await this.supabase
        .from('subscriptions')
        .update({
          end_date: newEndDate,
          amount: amount,
          status: SubscriptionStatus.ACTIVE,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dto.subscriptionId)
        .select('*')
        .single();

      if (updateError) {
        throw new HttpException(`续订失败：${updateError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 5. 创建账单记录
      await this.createInvoice(updatedSub.id, userId, amount, dto.billingCycle, dto.paymentMethodId);

      return {
        id: updatedSub.id,
        userId: updatedSub.user_id,
        planId: updatedSub.plan_id,
        planInfo: plan as PlanInfo,
        billingCycle: updatedSub.billing_cycle as BillingCycle,
        status: updatedSub.status as SubscriptionStatus,
        startDate: updatedSub.start_date,
        endDate: updatedSub.end_date,
        autoRenew: updatedSub.auto_renew,
        amount: updatedSub.amount,
        paymentMethod: updatedSub.payment_method,
        createdAt: updatedSub.created_at,
        updatedAt: updatedSub.updated_at,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`续订套餐失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取订阅列表
   */
  async getSubscriptionList(dto: GetSubscriptionListDto, userId: string): Promise<{
    list: SubscriptionInfo[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    try {
      // 1. 构建查询条件
      let query = this.supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', userId);

      // 2. 筛选条件
      if (dto.status) query = query.eq('status', dto.status);
      if (dto.planType) query = query.eq('plans.type', dto.planType);

      // 3. 分页处理
      const from = (dto.page - 1) * dto.pageSize;
      const to = from + dto.pageSize - 1;
      query = query.range(from, to);

      // 4. 获取总数
      const { count } = await this.supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // 5. 执行查询
      const { data, error } = await query;
      if (error) {
        throw new HttpException(`查询失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 6. 格式化结果
      const list = data.map((item) => ({
        id: item.id,
        userId: item.user_id,
        planId: item.plan_id,
        planInfo: {
          id: item.plans.id,
          name: item.plans.name,
          type: item.plans.type as PlanType,
          price: item.plans.price,
          features: item.plans.features,
          maxUsers: item.plans.max_users,
          maxProjects: item.plans.max_projects,
          isActive: item.plans.is_active,
        },
        billingCycle: item.billing_cycle as BillingCycle,
        status: item.status as SubscriptionStatus,
        startDate: item.start_date,
        endDate: item.end_date,
        autoRenew: item.auto_renew,
        amount: item.amount,
        paymentMethod: item.payment_method,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));

      return {
        list,
        total: count || 0,
        page: dto.page,
        pageSize: dto.pageSize,
      };
    } catch (error) {
      throw new HttpException(`获取订阅列表失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取订阅详情
   */
  async getSubscriptionDetail(subscriptionId: string): Promise<SubscriptionInfo> {
    try {
      const { data, error } = await this.supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('id', subscriptionId)
        .single();

      if (error || !data) {
        throw new HttpException('订阅记录不存在', HttpStatus.NOT_FOUND);
      }

      return {
        id: data.id,
        userId: data.user_id,
        planId: data.plan_id,
        planInfo: {
          id: data.plans.id,
          name: data.plans.name,
          type: data.plans.type as PlanType,
          price: data.plans.price,
          features: data.plans.features,
          maxUsers: data.plans.max_users,
          maxProjects: data.plans.max_projects,
          isActive: data.plans.is_active,
        },
        billingCycle: data.billing_cycle as BillingCycle,
        status: data.status as SubscriptionStatus,
        startDate: data.start_date,
        endDate: data.end_date,
        autoRenew: data.auto_renew,
        amount: data.amount,
        paymentMethod: data.payment_method,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`获取订阅详情失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 校验订阅归属
   */
  async checkSubscriptionOwner(subscriptionId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('subscriptions')
        .select('id')
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .single();

      return !!data && !error;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取可用套餐列表
   */
  async getAvailablePlans(type?: PlanType): Promise<PlanInfo[]> {
    try {
      let query = this.supabase
        .from('plans')
        .select('*')
        .eq('is_active', true);

      if (type) query = query.eq('type', type);

      const { data, error } = await query;
      if (error) {
        throw new HttpException(`查询套餐失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return data.map((plan) => ({
        id: plan.id,
        name: plan.name,
        type: plan.type as PlanType,
        price: plan.price,
        features: plan.features,
        maxUsers: plan.max_users,
        maxProjects: plan.max_projects,
        isActive: plan.is_active,
      }));
    } catch (error) {
      throw new HttpException(`获取套餐列表失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取账单列表
   */
  async getInvoiceList(params: { page: number; pageSize: number; status?: string }, userId: string): Promise<{
    list: InvoiceInfo[];
    total: number;
  }> {
    try {
      // 1. 构建查询
      let query = this.supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId);

      if (params.status) query = query.eq('status', params.status);

      // 2. 分页
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;
      query = query.range(from, to);

      // 3. 总数
      const { count } = await this.supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // 4. 执行查询
      const { data, error } = await query;
      if (error) {
        throw new HttpException(`查询账单失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const list = data.map((invoice) => ({
        id: invoice.id,
        subscriptionId: invoice.subscription_id,
        userId: invoice.user_id,
        amount: invoice.amount,
        status: invoice.status,
        billingCycle: invoice.billing_cycle as BillingCycle,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        paymentMethod: invoice.payment_method,
        receiptUrl: invoice.receipt_url,
      }));

      return { list, total: count || 0 };
    } catch (error) {
      throw new HttpException(`获取账单列表失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取账单详情
   */
  async getInvoiceDetail(invoiceId: string): Promise<InvoiceInfo> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (error || !data) {
        throw new HttpException('账单记录不存在', HttpStatus.NOT_FOUND);
      }

      return {
        id: data.id,
        subscriptionId: data.subscription_id,
        userId: data.user_id,
        amount: data.amount,
        status: data.status,
        billingCycle: data.billing_cycle as BillingCycle,
        issueDate: data.issue_date,
        dueDate: data.due_date,
        paymentMethod: data.payment_method,
        receiptUrl: data.receipt_url,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`获取账单详情失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 校验账单归属
   */
  async checkInvoiceOwner(invoiceId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('id')
        .eq('id', invoiceId)
        .eq('user_id', userId)
        .single();

      return !!data && !error;
    } catch (error) {
      return false;
    }
  }

  /**
   * 恢复已取消的订阅
   */
  async restoreSubscription(subscriptionId: string, userId: string): Promise<SubscriptionInfo> {
    try {
      // 1. 更新订阅状态
      const { data: updatedSub, error } = await this.supabase
        .from('subscriptions')
        .update({
          status: SubscriptionStatus.ACTIVE,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .select('*, plans(*)')
        .single();

      if (error) {
        throw new HttpException(`恢复订阅失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        id: updatedSub.id,
        userId: updatedSub.user_id,
        planId: updatedSub.plan_id,
        planInfo: {
          id: updatedSub.plans.id,
          name: updatedSub.plans.name,
          type: updatedSub.plans.type as PlanType,
          price: updatedSub.plans.price,
          features: updatedSub.plans.features,
          maxUsers: updatedSub.plans.max_users,
          maxProjects: updatedSub.plans.max_projects,
          isActive: updatedSub.plans.is_active,
        },
        billingCycle: updatedSub.billing_cycle as BillingCycle,
        status: updatedSub.status as SubscriptionStatus,
        startDate: updatedSub.start_date,
        endDate: updatedSub.end_date,
        autoRenew: updatedSub.auto_renew,
        amount: updatedSub.amount,
        paymentMethod: updatedSub.payment_method,
        createdAt: updatedSub.created_at,
        updatedAt: updatedSub.updated_at,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`恢复订阅失败：${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 验证优惠券
   */
  async validateCoupon(couponCode: string, planId?: string, userId?: string): Promise<{
    valid: boolean;
    discount: number;
    expired: boolean;
    message?: string;
  }> {
    try {
      // 1. 查询优惠券
      const { data: coupon, error } = await this.supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .single();

      if (error || !coupon) {
        return { valid: false, discount: 0, expired: false, message: '优惠券不存在' };
      }

      // 2. 校验有效期
      const now = new Date();
      const expired = new Date(coupon.expire_date) < now;
      if (expired) {
        return { valid: false, discount: 0, expired: true, message: '优惠券已过期' };
      }

      // 3. 校验适用套餐（如有）
      if (planId && coupon.applicable_plans && !coupon.applicable_plans.includes(planId)) {
        return { valid: false, discount: 0, expired: false, message: '优惠券不适用于该套餐' };
      }

      // 4. 校验使用次数
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        return { valid: false, discount: 0, expired: false, message: '优惠券已用完' };
      }

      return { valid: true, discount: coupon.discount_rate, expired: false };
    } catch (error) {
      return { valid: false, discount: 0, expired: false, message: '验证优惠券失败' };
    }
  }

  // ===================== 私有工具方法 =====================
  /**
   * 计算订阅结束时间
   */
  private calculateEndDate(cycle: BillingCycle): string {
    const now = new Date();
    switch (cycle) {
      case BillingCycle.MONTHLY:
        now.setMonth(now.getMonth() + 1);
        break;
      case BillingCycle.QUARTERLY:
        now.setMonth(now.getMonth() + 3);
        break;
      case BillingCycle.YEARLY:
        now.setFullYear(now.getFullYear() + 1);
        break;
    }
    return now.toISOString();
  }

  /**
   * 计算续订后的结束时间
   */
  private calculateRenewEndDate(currentEndDate: string, cycle: BillingCycle, count: number): string {
    const endDate = new Date(currentEndDate);
    switch (cycle) {
      case BillingCycle.MONTHLY:
        endDate.setMonth(endDate.getMonth() + count);
        break;
      case BillingCycle.QUARTERLY:
        endDate.setMonth(endDate.getMonth() + 3 * count);
        break;
      case BillingCycle.YEARLY:
        endDate.setFullYear(endDate.getFullYear() + count);
        break;
    }
    return endDate.toISOString();
  }

  /**
   * 创建账单记录
   */
  private async createInvoice(subscriptionId: string, userId: string, amount: number, cycle: BillingCycle, paymentMethodId: string): Promise<void> {
    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7天内付款

    await this.supabase
      .from('invoices')
      .insert({
        subscription_id: subscriptionId,
        user_id: userId,
        amount: amount,
        status: 'pending',
        billing_cycle: cycle,
        issue_date: now.toISOString(),
        due_date: dueDate.toISOString(),
        payment_method: paymentMethodId,
        created_at: now.toISOString(),
      });
  }
}