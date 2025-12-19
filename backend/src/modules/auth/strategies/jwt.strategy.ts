/**
 * JWT 策略 - 验证自签 JWT + 防篡改
 * 使用 Supabase Admin API 查询用户（需 service_role_key）
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseConfig } from 'src/config/supabase.config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseConfig: SupabaseConfig,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // 使用 admin client 查询用户（需 service_role_key）
    const { data: authUser, error } = await this.supabaseConfig
      .getAdminClient()
      .auth.admin.getUserById(payload.sub);

    if (error || !authUser?.user) {
      throw new UnauthorizedException('用户不存在');
    }

    // 防篡改校验
    if (authUser.user.email !== payload.email) {
      throw new UnauthorizedException('Token 无效');
    }

    const meta = authUser.user.user_metadata || {};

    if (meta.role && meta.role !== payload.role) {
      throw new UnauthorizedException('权限异常');
    }

    return {
      id: payload.sub,
      email: payload.email,
      nickname: meta.nickname || payload.email.split('@')[0],
      role: meta.role || 'user',
      subscriptionPlan: meta.subscription_plan || 'free',
    };
  }
}