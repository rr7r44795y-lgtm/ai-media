import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * 当前用户数据结构（根据业务需求扩展）
 * 与JWT Payload/数据库用户表结构对齐
 */
export interface CurrentUser {
  id: string; // 用户唯一标识（Supabase/User表ID）
  email: string; // 用户邮箱
  role: 'user' | 'admin' | 'enterprise'; // 用户角色（适配SaaS套餐）
  subscriptionPlan?: 'free' | 'basic' | 'pro' | 'enterprise'; // 订阅套餐
  isVerified: boolean; // 邮箱是否验证
  createdAt: string; // 用户创建时间
}

/**
 * 自定义装饰器：@CurrentUser()
 * 从请求上下文提取当前登录用户信息
 * 支持指定提取用户的某个字段（如 @CurrentUser('id') 获取用户ID）
 */
export const CurrentUser = createParamDecorator(
  (field: keyof CurrentUser | undefined, ctx: ExecutionContext): CurrentUser | any => {
    // 获取HTTP请求上下文
    const request = ctx.switchToHttp().getRequest();

    // 校验用户信息是否存在（未登录则抛401）
    if (!request.user) {
      throw new UnauthorizedException('未登录或登录状态已过期，请重新登录');
    }

    // 类型校验（确保user符合CurrentUser结构）
    const user = request.user as CurrentUser;
    if (!user.id || !user.email) {
      throw new UnauthorizedException('用户信息不完整，请重新登录');
    }

    // 如果指定了字段，仅返回该字段值；否则返回完整用户信息
    return field ? user[field] : user;
  },
);

/**
 * 自定义装饰器：@Public()
 * 标记接口为公开接口，豁免AuthGuard认证（如登录/注册/公开文档）
 */
export const Public = () => {
  return (target: any, key: string | symbol, descriptor: PropertyDescriptor) => {
    // 给控制器方法添加元数据，AuthGuard会读取此元数据
    Reflect.defineMetadata('isPublic', true, descriptor.value);
    return descriptor;
  };
};