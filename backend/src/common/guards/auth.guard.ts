import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfig } from '../../config/app.config';

/**
 * JWT 鉴权守卫
 * 验证用户登录状态，解析Token并挂载用户信息到request
 */
@Injectable() // 必须加@Injectable，否则无法依赖注入
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService, // 依赖JWT服务
    private readonly appConfig: AppConfig,   // 依赖配置服务
  ) {}

  // 实现CanActivate接口的核心方法
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取HTTP请求对象
    const request = context.switchToHttp().getRequest<Request>();
    // 从请求头提取Token
    const token = this.extractTokenFromHeader(request);

    // 无Token则抛出未授权异常
    if (!token) {
      throw new UnauthorizedException('未登录，请先登录');
    }

    try {
      // 验证Token有效性
      const payload = await this.jwtService.verifyAsync(
        token,
        { secret: this.appConfig.jwtSecret } // 从配置读取JWT密钥
      );
      // 将用户信息挂载到request，供后续控制器使用
      request.user = payload;
    } catch (error) {
      // Token过期/无效则抛出异常
      throw new UnauthorizedException('登录状态已过期，请重新登录');
    }

    // 鉴权通过
    return true;
  }

  /**
   * 从请求头提取Bearer Token
   * @param request HTTP请求对象
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    // 兼容Header大小写，提取Authorization头
    const authHeader = request.headers.authorization || request.headers.Authorization;
    if (!authHeader) return undefined;

    // 拆分Bearer和Token（格式：Bearer <token>）
    const [type, token] = Array.isArray(authHeader) ? authHeader[0].split(' ') : authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}