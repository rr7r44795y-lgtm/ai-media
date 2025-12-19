/**
 * 社交平台连接授权DTO
 * 路径：platform/dto/connect-platform.dto.ts
 * 统一各平台授权参数格式，支持参数校验，与所有平台适配器无缝兼容
 */
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUrl,
  IsNotEmpty,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * 支持的社交平台枚举
 */
export enum PlatformType {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  LINKEDIN = 'linkedin',
  TWITTER = 'twitter', // 预留扩展
  TIKTOK = 'tiktok',   // 预留扩展
  WECHAT = 'wechat',   // 预留扩展
}

/**
 * 平台授权类型枚举
 */
export enum AuthType {
  AUTHORIZATION_CODE = 'authorization_code', // 授权码模式（主流）
  REFRESH_TOKEN = 'refresh_token',           // 刷新令牌模式
  CLIENT_CREDENTIALS = 'client_credentials', // 客户端凭证模式
  PASSWORD = 'password',                     // 密码模式（少用）
}

/**
 * 平台连接请求DTO（前端发起授权连接时使用）
 */
export class ConnectPlatformDto {
  /**
   * 平台类型（必填）
   */
  @IsEnum(PlatformType, {
    message: `平台类型必须是：${Object.values(PlatformType).join(', ')}`,
  })
  @IsNotEmpty({ message: '平台类型不能为空' })
  platform: PlatformType;

  /**
   * 授权类型（默认authorization_code）
   */
  @IsEnum(AuthType, {
    message: `授权类型必须是：${Object.values(AuthType).join(', ')}`,
  })
  @IsOptional()
  authType: AuthType = AuthType.AUTHORIZATION_CODE;

  /**
   * 授权码（授权码模式必填）
   */
  @ValidateIf((o) => o.authType === AuthType.AUTHORIZATION_CODE)
  @IsString({ message: '授权码必须是字符串' })
  @IsNotEmpty({ message: '授权码不能为空' })
  @Length(10, 500, { message: '授权码长度需在10-500字符之间' })
  code?: string;

  /**
   * 刷新令牌（刷新令牌模式必填）
   */
  @ValidateIf((o) => o.authType === AuthType.REFRESH_TOKEN)
  @IsString({ message: '刷新令牌必须是字符串' })
  @IsNotEmpty({ message: '刷新令牌不能为空' })
  refreshToken?: string;

  /**
   * 授权回调地址（授权码模式可选，默认使用配置的地址）
   */
  @ValidateIf((o) => o.authType === AuthType.AUTHORIZATION_CODE && o.redirectUri)
  @IsUrl({}, { message: '回调地址必须是合法的URL' })
  @IsOptional()
  redirectUri?: string;

  /**
   * 状态值（防CSRF，可选）
   */
  @IsString()
  @IsOptional()
  @Length(8, 100, { message: '状态值长度需在8-100字符之间' })
  state?: string;

  /**
   * 授权范围（可选，各平台默认值不同）
   * 示例：facebook=email,public_profile；linkedin=r_liteprofile,w_member_social
   */
  @IsString()
  @IsOptional()
  scope?: string;

  /**
   * 平台账号ID（可选，如Facebook页面ID、YouTube频道ID）
   */
  @IsString()
  @IsOptional()
  @Matches(/^[\w-]+$/, { message: '账号ID只能包含字母、数字、下划线、短横线' })
  accountId?: string;

  /**
   * 用户自定义名称（可选，用于标识该授权连接）
   */
  @IsString()
  @IsOptional()
  @Length(2, 50, { message: '自定义名称长度需在2-50字符之间' })
  @Transform(({ value }) => value?.trim()) // 去除首尾空格
  nickname?: string;
}

/**
 * 平台连接响应DTO（返回给前端的授权连接结果）
 */
export class ConnectPlatformResponseDto {
  /**
   * 连接ID（数据库存储的唯一标识）
   */
  @IsString()
  id: string;

  /**
   * 平台类型
   */
  @IsEnum(PlatformType)
  platform: PlatformType;

  /**
   * 授权账号信息
   */
  @IsString()
  accountName: string;

  /**
   * 账号ID（平台侧的唯一标识）
   */
  @IsString()
  accountId: string;

  /**
   * 访问令牌（脱敏显示）
   */
  @IsString()
  accessToken: string;

  /**
   * 令牌过期时间（时间戳，单位秒）
   */
  @IsString()
  expiresIn: string;

  /**
   * 刷新令牌（脱敏显示，可选）
   */
  @IsOptional()
  @IsString()
  refreshToken?: string;

  /**
   * 授权范围
   */
  @IsString()
  scope: string;

  /**
   * 用户自定义名称
   */
  @IsOptional()
  @IsString()
  nickname?: string;

  /**
   * 创建时间
   */
  @IsString()
  createdAt: string;

  /**
   * 最后更新时间
   */
  @IsString()
  updatedAt: string;

  /**
   * 连接状态（active=有效，expired=过期，invalid=无效）
   */
  @IsEnum(['active', 'expired', 'invalid'])
  status: 'active' | 'expired' | 'invalid';
}

/**
 * 平台授权令牌DTO（内部使用，存储完整令牌信息）
 */
export class PlatformTokenDto {
  /**
   * 平台类型
   */
  @IsEnum(PlatformType)
  platform: PlatformType;

  /**
   * 访问令牌
   */
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  /**
   * 令牌过期时间（时间戳，单位秒）
   */
  @IsString()
  expiresIn: string;

  /**
   * 刷新令牌（可选）
   */
  @IsOptional()
  @IsString()
  refreshToken?: string;

  /**
   * 刷新令牌过期时间（可选）
   */
  @IsOptional()
  @IsString()
  refreshTokenExpiresIn?: string;

  /**
   * 账号ID（平台侧）
   */
  @IsString()
  @IsNotEmpty()
  accountId: string;

  /**
   * 账号名称（平台侧）
   */
  @IsString()
  accountName: string;

  /**
   * 授权范围
   */
  @IsString()
  scope: string;

  /**
   * 关联的用户ID（系统内用户ID）
   */
  @IsString()
  @IsNotEmpty()
  userId: string;
}

/**
 * 平台授权刷新请求DTO
 */
export class RefreshPlatformTokenDto {
  /**
   * 连接ID（数据库存储的连接ID）
   */
  @IsString()
  @IsNotEmpty({ message: '连接ID不能为空' })
  connectId: string;

  /**
   * 平台类型（可选，用于校验）
   */
  @IsEnum(PlatformType)
  @IsOptional()
  platform?: PlatformType;
}

/**
 * 平台授权撤销请求DTO
 */
export class RevokePlatformTokenDto {
  /**
   * 连接ID
   */
  @IsString()
  @IsNotEmpty({ message: '连接ID不能为空' })
  connectId: string;

  /**
   * 是否同时撤销平台侧的令牌（可选，默认true）
   */
  @IsOptional()
  revokeRemote: boolean = true;
}