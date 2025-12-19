import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEnum,
  IsPhoneNumber,
  ValidateIf,
} from 'class-validator';

/**
 * 用户角色枚举（限定注册时的角色范围）
 */
export enum UserRole {
  USER = 'user', // 普通用户（默认）
  ADMIN = 'admin', // 管理员（仅后台可注册，前端禁用）
  MERCHANT = 'merchant', // 商户（可选扩展）
}

/**
 * 注册请求DTO（数据传输对象）
 * 校验前端传入的注册参数，确保格式合法、数据完整
 */
export class RegisterDto {
  /**
   * 邮箱（必填，唯一）
   * 用于登录/找回密码，需符合标准邮箱格式
   */
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @MaxLength(100, { message: '邮箱长度不能超过100位' })
  email: string;

  /**
   * 手机号（可选，若填写则校验格式）
   * 适配国内手机号格式，可扩展支持国际号码
   */
  @IsOptional()
  @IsPhoneNumber('CN', { message: '请输入正确的中国大陆手机号' })
  phone?: string;

  /**
   * 密码（必填，强密码规则）
   * 长度8-20位，包含字母+数字+可选特殊字符，避免弱密码
   */
  @IsNotEmpty({ message: '密码不能为空' })
  @IsString({ message: '密码必须为字符串' })
  @MinLength(8, { message: '密码长度不能少于8位' })
  @MaxLength(20, { message: '密码长度不能超过20位' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    { message: '密码必须包含字母、数字和特殊字符（@$!%*?&），长度8-20位' }
  )
  password: string;

  /**
   * 确认密码（必填，需与密码一致）
   */
  @IsNotEmpty({ message: '确认密码不能为空' })
  @IsString({ message: '确认密码必须为字符串' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/, {
    message: '确认密码格式需与密码一致（包含字母、数字和特殊字符，长度8-20位）',
  })
  confirmPassword: string;

  /**
   * 昵称（必填，用于展示）
   * 长度2-20位，支持中英文、数字、下划线
   */
  @IsNotEmpty({ message: '昵称不能为空' })
  @IsString({ message: '昵称必须为字符串' })
  @MinLength(2, { message: '昵称长度不能少于2位' })
  @MaxLength(20, { message: '昵称长度不能超过20位' })
  @Matches(/^[\u4e00-\u9fa5a-zA-Z0-9_]{2,20}$/, {
    message: '昵称仅支持中英文、数字和下划线，长度2-20位',
  })
  nickname: string;

  /**
   * 验证码（必填，防止恶意注册）
   * 4-6位数字/字母组合
   */
  @IsNotEmpty({ message: '验证码不能为空' })
  @IsString({ message: '验证码必须为字符串' })
  @Length(4, 6, { message: '验证码长度为4-6位' })
  captcha: string;

  /**
   * 用户角色（可选，默认普通用户）
   * 前端注册时只能传user，admin需后台配置
   */
  @IsOptional()
  @IsEnum(UserRole, { message: `角色仅支持：${Object.values(UserRole).join(', ')}` })
  @ValidateIf((o) => o.role !== undefined) // 仅当传入role时校验
  role?: UserRole = UserRole.USER;

  /**
   * 同意用户协议（必填，前端需勾选）
   * 必须为true，否则禁止注册
   */
  @IsNotEmpty({ message: '请阅读并同意用户协议和隐私政策' })
  @Matches(/^true$/, { message: '必须同意用户协议和隐私政策才能注册' })
  agree: string;
}

/**
 * 注册响应DTO（规范返回格式）
 * 约束注册接口的返回数据结构
 */
export class RegisterResponseDto {
  /**
   * 注册状态
   */
  success: boolean;

  /**
   * 提示信息
   */
  message: string;

  /**
   * 用户ID（注册成功返回）
   */
  userId?: string;

  /**
   * 跳转提示（如需邮箱验证则返回验证链接）
   */
  redirect?: string;

  /**
   * 令牌（可选，注册成功后自动登录返回）
   */
  accessToken?: string;
}

/**
 * 邮箱验证DTO（注册后验证邮箱）
 */
export class EmailVerifyDto {
  @IsNotEmpty({ message: '验证令牌不能为空' })
  @IsString({ message: '验证令牌必须为字符串' })
  token: string;

  @IsNotEmpty({ message: '用户ID不能为空' })
  @IsString({ message: '用户ID必须为字符串' })
  userId: string;
}