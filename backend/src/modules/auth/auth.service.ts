/**
 * AuthService - 彻底使用 Supabase Auth 原生认证 + 自签 JWT
 * 无自定义用户表，所有扩展字段存 raw_user_meta_data
 */
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseConfig } from 'src/config/supabase.config';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SocialPlatform } from './auth.contronller';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly supabaseAuth;
  private readonly frontendDomain: string;
  private readonly supabaseUrl: string;

  constructor(
    private readonly supabaseConfig: SupabaseConfig,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.supabaseAuth = this.supabaseConfig.getClient().auth;
    this.frontendDomain = this.configService.get<string>('FRONTEND_DOMAIN')!;
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL')!;
  }

  /** 邮箱密码登录 */
  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const { data, error } = await this.supabaseAuth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
    });

    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const meta = data.user.user_metadata || {};

    const payload = {
      sub: data.user.id,
      email: data.user.email!,
      role: meta.role || 'user',
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: data.session.refresh_token,
      tokenType: 'Bearer',
      expiresIn: Math.floor((data.session.expires_at! - Date.now() / 1000)),
      user: {
        id: data.user.id,
        email: data.user.email!,
        nickname: meta.nickname || data.user.email!.split('@')[0],
        role: meta.role || 'user',
        subscriptionPlan: meta.subscription_plan || 'free',
      },
    };
  }

  /** 注册 + 自动发送验证邮件 */
  async register(registerDto: RegisterDto): Promise<{ message: string }> {
    const { data, error } = await this.supabaseAuth.signUp({
      email: registerDto.email,
      password: registerDto.password,
      options: {
        data: {
          nickname: registerDto.nickname || registerDto.email.split('@')[0],
          role: 'user',
          subscription_plan: 'free',
        },
        emailRedirectTo: `${this.frontendDomain}/auth/confirm`,
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        throw new BadRequestException('邮箱已被注册');
      }
      throw new BadRequestException(error.message);
    }

    return { message: '注册成功，请查收验证邮件激活账号' };
  }

  /** Magic Link 无密码登录 */
  async sendMagicLink(email: string): Promise<{ message: string }> {
    const { error } = await this.supabaseAuth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${this.frontendDomain}/auth/magic-link`,
      },
    });

    if (error) throw new BadRequestException('发送魔法链接失败');

    return { message: '魔法链接已发送，请查收邮件' };
  }

  /** 获取社交登录授权 URL（前端跳转） */
  getSocialAuthUrl(platform: SocialPlatform): string {
    const providerMap: Record<SocialPlatform, string> = {
      [SocialPlatform.GOOGLE]: 'google',
      [SocialPlatform.FACEBOOK]: 'facebook',
      [SocialPlatform.INSTAGRAM]: 'facebook', // Instagram 用 Facebook provider
      [SocialPlatform.TWITTER]: 'twitter',
    };

    const provider = providerMap[platform];
    if (!provider) throw new BadRequestException('不支持的社交平台');

    return `${this.supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${this.frontendDomain}/auth/social-callback`;
  }

  /** 获取当前用户信息（/auth/me 使用） */
  async getCurrentUser(userId: string) {
    const { data: { user }, error } = await this.supabaseAuth.getUser();

    if (error || !user) {
      throw new UnauthorizedException('用户会话无效');
    }

    const meta = user.user_metadata || {};

    return {
      id: user.id,
      email: user.email!,
      nickname: meta.nickname || user.email!.split('@')[0],
      role: meta.role || 'user',
      subscriptionPlan: meta.subscription_plan || 'free',
      emailConfirmed: !!user.email_confirmed_at,
      createdAt: user.created_at,
    };
  }

  /** 退出登录 */
  async logout() {
    await this.supabaseAuth.signOut();
  }
}