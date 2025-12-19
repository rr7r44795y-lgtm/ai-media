import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * OAuth平台类型枚举
 * 约束支持的社交平台，避免硬编码字符串
 */
export enum OAuthPlatform {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  LINKEDIN = 'linkedin',
  YOUTUBE = 'youtube',
}

/**
 * 单平台OAuth配置结构
 */
export interface OAuthPlatformConfig {
  clientId: string; // 平台应用ID
  clientSecret: string; // 平台应用密钥
  redirectUri: string; // 授权回调地址（后端接收code的接口）
  scope: string[]; // 授权权限范围
  authUrl: string; // 平台授权页URL
  tokenUrl: string; // 平台获取Token的URL
  apiBaseUrl: string; // 平台API基础URL
}

/**
 * OAuth统一配置类
 * 封装所有社交平台的OAuth配置，全局可注入
 */
@Injectable()
export class OAuthConfig {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 获取指定平台的OAuth配置
   * @param platform 平台类型（OAuthPlatform枚举）
   * @returns 对应平台的完整配置
   */
  getPlatformConfig(platform: OAuthPlatform): OAuthPlatformConfig {
    switch (platform) {
      case OAuthPlatform.INSTAGRAM:
        return this.getInstagramConfig();
      case OAuthPlatform.FACEBOOK:
        return this.getFacebookConfig();
      case OAuthPlatform.LINKEDIN:
        return this.getLinkedinConfig();
      case OAuthPlatform.YOUTUBE:
        return this.getYoutubeConfig();
      default:
        throw new Error(`Unsupported OAuth platform: ${platform}`);
    }
  }

  // ====================== 各平台具体配置 ======================
  /** Instagram Business API OAuth配置 */
  private getInstagramConfig(): OAuthPlatformConfig {
    const backendDomain = this.configService.get<string>('BACKEND_DOMAIN'); // Render后端域名
    return {
      clientId: this.configService.get<string>('INSTAGRAM_CLIENT_ID'),
      clientSecret: this.configService.get<string>('INSTAGRAM_CLIENT_SECRET'),
      redirectUri: `${backendDomain}/api/platform/instagram/callback`, // 授权回调接口
      scope: ['instagram_basic', 'pages_show_list', 'pages_manage_posts'], // 按需调整权限
      authUrl: 'https://www.facebook.com/v18.0/dialog/oauth', // IG通过FB授权
      tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
      apiBaseUrl: 'https://graph.facebook.com/v18.0',
    };
  }

  /** Facebook Page API OAuth配置 */
  private getFacebookConfig(): OAuthPlatformConfig {
    const backendDomain = this.configService.get<string>('BACKEND_DOMAIN');
    return {
      clientId: this.configService.get<string>('FACEBOOK_CLIENT_ID'),
      clientSecret: this.configService.get<string>('FACEBOOK_CLIENT_SECRET'),
      redirectUri: `${backendDomain}/api/platform/facebook/callback`,
      scope: ['pages_manage_posts', 'pages_read_engagement', 'public_profile'],
      authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
      apiBaseUrl: 'https://graph.facebook.com/v18.0',
    };
  }

  /** LinkedIn API OAuth配置 */
  private getLinkedinConfig(): OAuthPlatformConfig {
    const backendDomain = this.configService.get<string>('BACKEND_DOMAIN');
    return {
      clientId: this.configService.get<string>('LINKEDIN_CLIENT_ID'),
      clientSecret: this.configService.get<string>('LINKEDIN_CLIENT_SECRET'),
      redirectUri: `${backendDomain}/api/platform/linkedin/callback`,
      scope: ['r_liteprofile', 'w_member_social', 'rw_organization_admin'],
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      apiBaseUrl: 'https://api.linkedin.com/v2',
    };
  }

  /** YouTube Data API OAuth配置 */
  private getYoutubeConfig(): OAuthPlatformConfig {
    const backendDomain = this.configService.get<string>('BACKEND_DOMAIN');
    return {
      clientId: this.configService.get<string>('YOUTUBE_CLIENT_ID'),
      clientSecret: this.configService.get<string>('YOUTUBE_CLIENT_SECRET'),
      redirectUri: `${backendDomain}/api/platform/youtube/callback`,
      scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      apiBaseUrl: 'https://www.googleapis.com/youtube/v3',
    };
  }

  /**
   * 获取所有支持的OAuth平台列表
   * @returns 平台枚举数组
   */
  getSupportedPlatforms(): OAuthPlatform[] {
    return Object.values(OAuthPlatform);
  }
}

/**
 * OAuth配置注册函数（供模块导入）
 * 封装依赖注入逻辑，确保全局可注入
 */
export const registerOAuthConfig = () => ({
  provide: OAuthConfig,
  useFactory: (configService: ConfigService) => new OAuthConfig(configService),
  inject: [ConfigService],
});