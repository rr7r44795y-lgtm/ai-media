/**
 * 认证控制器
 * 处理登录/注册/刷新Token/社交平台授权/密码重置等核心认证接口
 */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Get,
  Query,
  Patch,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator'; // 自定义装饰器
import { JwtPayload } from './strategies/jwt.strategy';
import { ResetPasswordDto, VerifyCaptchaDto } from './dto/reset-password.dto'; // 补充密码重置DTO
import { Public } from 'src/common/decorators/current-user.decorator';

/**
 * 社交平台授权类型枚举
 */
export enum SocialPlatform {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  TWITTER = 'twitter',
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // 邮箱密码登录 + Magic Link
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    if (loginDto.type === 'magic_link') {
      return this.authService.sendMagicLink(loginDto.email);
    }
    return this.authService.login(loginDto);
  }

  // 注册（Supabase 发送验证邮件）
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // 获取社交登录 URL（前端跳转）
  @Public()
  @Get('social/authorize')
  getSocialAuthUrl(@Query('platform') platform: SocialPlatform) {
    const url = this.authService.getSocialAuthUrl(platform);
    return { success: true, data: { authUrl: url } };
  }

  // 获取当前用户信息
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getCurrentUser(@CurrentUser() user: JwtPayload) {
    const userInfo = await this.authService.getCurrentUser(user.sub);
    return { success: true, data: userInfo };
  }

  // 退出登录（可选，前端 supabase.signOut() 即可）
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout() {
    await this.authService.logout();
    return { success: true, message: '退出登录成功' };
  }

  // 以下密码重置接口可保留（手动实现更灵活）
  @Public()
  @Post('reset-password/send-captcha')
  async sendResetPasswordCaptcha(@Body('email') email: string) { ... }

  @Public()
  @Post('reset-password/verify-captcha')
  async verifyResetPasswordCaptcha(@Body() dto: VerifyCaptchaDto) { ... }

  @Public()
  @Patch('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) { ... }
}