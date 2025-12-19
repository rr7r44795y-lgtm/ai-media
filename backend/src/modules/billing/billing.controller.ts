/**
 * 计费模块控制器
 * 处理套餐订阅、升级/降级、续订、取消、账单查询等核心计费接口
 * 路径：src/modules/billing/billing.controller.ts
 */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
  Get,
  Query,
  Param,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BillingService } from './billing.service';
// 导入DTO和枚举（适配当前目录结构）
import {
  SubscribePlanDto,
  ChangePlanDto,
  CancelSubscriptionDto,
  RenewSubscriptionDto,
  GetSubscriptionListDto,
  PlanType,
  SubscriptionStatus,
} from './dto/subscribe-plan';
// 自定义装饰器：获取当前登录用户（需提前创建）
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
// JWT载荷类型（从auth模块导入）
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Controller('billing')
@UseGuards(AuthGuard('jwt')) // 所有计费接口强制登录鉴权
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * 订阅套餐接口
   * POST /billing/subscribe
   * @param dto 订阅套餐参数
   * @param user 当前登录用户
   * @returns 订阅结果（含支付链接/订单信息）
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  async subscribePlan(
    @Body() dto: SubscribePlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 调用服务层创建订阅，关联当前用户ID
      const result = await this.billingService.subscribePlan(dto, user.sub);
      return {
        success: true,
        message: '套餐订阅请求已提交，请完成支付',
        data: result,
      };
    } catch (error) {
      // 业务异常直接抛出，系统异常封装友好提示
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `订阅套餐失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 升级/降级套餐接口
   * PATCH /billing/change-plan
   * @param dto 变更套餐参数
   * @param user 当前登录用户
   * @returns 变更结果
   */
  @Patch('change-plan')
  @HttpCode(HttpStatus.OK)
  async changePlan(
    @Body() dto: ChangePlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 校验订阅归属（用户只能操作自己的订阅）
      const isOwner = await this.billingService.checkSubscriptionOwner(
        dto.subscriptionId,
        user.sub,
      );
      if (!isOwner) {
        throw new HttpException('无权操作该订阅', HttpStatus.FORBIDDEN);
      }

      const result = await this.billingService.changePlan(dto, user.sub);
      return {
        success: true,
        message: `套餐将${dto.effectiveTime === 'immediate' ? '立即' : '下一计费周期'}生效`,
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `变更套餐失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 取消订阅接口
   * PATCH /billing/cancel-subscription
   * @param dto 取消订阅参数
   * @param user 当前登录用户
   * @returns 取消结果
   */
  @Patch('cancel-subscription')
  @HttpCode(HttpStatus.OK)
  async cancelSubscription(
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 二次确认防误操作
      if (!dto.confirmCancel) {
        throw new HttpException('请确认取消订阅', HttpStatus.BAD_REQUEST);
      }

      // 校验订阅归属
      const isOwner = await this.billingService.checkSubscriptionOwner(
        dto.subscriptionId,
        user.sub,
      );
      if (!isOwner) {
        throw new HttpException('无权操作该订阅', HttpStatus.FORBIDDEN);
      }

      await this.billingService.cancelSubscription(dto, user.sub);
      return {
        success: true,
        message: '订阅已成功取消，当前周期结束后失效',
        data: {
          subscriptionId: dto.subscriptionId,
          cancelTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `取消订阅失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 手动续订套餐接口
   * POST /billing/renew
   * @param dto 续订参数
   * @param user 当前登录用户
   * @returns 续订结果
   */
  @Post('renew')
  @HttpCode(HttpStatus.OK)
  async renewSubscription(
    @Body() dto: RenewSubscriptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 校验订阅归属
      const isOwner = await this.billingService.checkSubscriptionOwner(
        dto.subscriptionId,
        user.sub,
      );
      if (!isOwner) {
        throw new HttpException('无权操作该订阅', HttpStatus.FORBIDDEN);
      }

      const result = await this.billingService.renewSubscription(dto, user.sub);
      return {
        success: true,
        message: '套餐续订成功',
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `续订套餐失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取用户订阅列表（分页+筛选）
   * GET /billing/subscriptions
   * @param dto 分页筛选参数
   * @param user 当前登录用户
   * @returns 订阅列表+分页信息
   */
  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  async getSubscriptionList(
    @Query() dto: GetSubscriptionListDto,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      const { list, total, page, pageSize } =
        await this.billingService.getSubscriptionList(dto, user.sub);
      return {
        success: true,
        data: {
          list, // 订阅列表（SubscriptionInfo类型）
          pagination: {
            total, // 总条数
            page, // 当前页
            pageSize, // 每页条数
            totalPages: Math.ceil(total / pageSize), // 总页数
          },
        },
      };
    } catch (error) {
      throw new HttpException(
        `获取订阅列表失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取单个订阅详情
   * GET /billing/subscriptions/:subscriptionId
   * @param subscriptionId 订阅ID
   * @param user 当前登录用户
   * @returns 订阅详情
   */
  @Get('subscriptions/:subscriptionId')
  @HttpCode(HttpStatus.OK)
  async getSubscriptionDetail(
    @Param('subscriptionId') subscriptionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 校验订阅归属
      const isOwner = await this.billingService.checkSubscriptionOwner(
        subscriptionId,
        user.sub,
      );
      if (!isOwner) {
        throw new HttpException('无权查看该订阅', HttpStatus.FORBIDDEN);
      }

      const detail = await this.billingService.getSubscriptionDetail(subscriptionId);
      if (!detail) {
        throw new NotFoundException('订阅记录不存在');
      }

      return {
        success: true,
        data: detail,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `获取订阅详情失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取可用套餐列表
   * GET /billing/plans
   * @param type 套餐类型筛选（可选）
   * @returns 套餐列表
   */
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  async getAvailablePlans(@Query('type') type?: PlanType) {
    try {
      const plans = await this.billingService.getAvailablePlans(type);
      return {
        success: true,
        data: plans,
      };
    } catch (error) {
      throw new HttpException(
        `获取套餐列表失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取账单列表（分页+筛选）
   * GET /billing/invoices
   * @param page 页码
   * @param pageSize 每页条数
   * @param status 账单状态筛选
   * @param user 当前登录用户
   * @returns 账单列表+分页信息
   */
  @Get('invoices')
  @HttpCode(HttpStatus.OK)
  async getInvoiceList(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 10,
    @Query('status') status?: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 分页参数校验
      const pageNum = parseInt(page as string, 10) || 1;
      const size = parseInt(pageSize as string, 10) || 10;
      if (pageNum < 1) throw new HttpException('页码不能小于1', HttpStatus.BAD_REQUEST);
      if (size < 1 || size > 50) throw new HttpException('每页条数需在1-50之间', HttpStatus.BAD_REQUEST);

      const { list, total } = await this.billingService.getInvoiceList(
        { page: pageNum, pageSize: size, status },
        user.sub,
      );

      return {
        success: true,
        data: {
          list, // 账单列表（InvoiceInfo类型）
          pagination: {
            total,
            page: pageNum,
            pageSize: size,
            totalPages: Math.ceil(total / size),
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `获取账单列表失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取单个账单详情
   * GET /billing/invoices/:invoiceId
   * @param invoiceId 账单ID
   * @param user 当前登录用户
   * @returns 账单详情
   */
  @Get('invoices/:invoiceId')
  @HttpCode(HttpStatus.OK)
  async getInvoiceDetail(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 校验账单归属
      const isOwner = await this.billingService.checkInvoiceOwner(invoiceId, user.sub);
      if (!isOwner) {
        throw new HttpException('无权查看该账单', HttpStatus.FORBIDDEN);
      }

      const detail = await this.billingService.getInvoiceDetail(invoiceId);
      if (!detail) {
        throw new NotFoundException('账单记录不存在');
      }

      return {
        success: true,
        data: detail,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `获取账单详情失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 恢复已取消的订阅
   * PATCH /billing/subscriptions/:subscriptionId/restore
   * @param subscriptionId 订阅ID
   * @param user 当前登录用户
   * @returns 恢复结果
   */
  @Patch('subscriptions/:subscriptionId/restore')
  @HttpCode(HttpStatus.OK)
  async restoreSubscription(
    @Param('subscriptionId') subscriptionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 校验订阅归属
      const isOwner = await this.billingService.checkSubscriptionOwner(
        subscriptionId,
        user.sub,
      );
      if (!isOwner) {
        throw new HttpException('无权操作该订阅', HttpStatus.FORBIDDEN);
      }

      const result = await this.billingService.restoreSubscription(subscriptionId, user.sub);
      return {
        success: true,
        message: '订阅已成功恢复',
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `恢复订阅失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 验证优惠券有效性
   * POST /billing/validate-coupon
   * @param couponCode 优惠券码
   * @param planId 套餐ID（可选）
   * @param user 当前登录用户
   * @returns 优惠券验证结果
   */
  @Post('validate-coupon')
  @HttpCode(HttpStatus.OK)
  async validateCoupon(
    @Body('couponCode') couponCode: string,
    @Body('planId') planId?: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      if (!couponCode) {
        throw new HttpException('优惠券码不能为空', HttpStatus.BAD_REQUEST);
      }

      const result = await this.billingService.validateCoupon(couponCode, planId, user.sub);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `验证优惠券失败：${error.message || '服务器内部错误'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}