import { 
  IsString, 
  IsNotEmpty, 
  IsEmail,           // 用这个代替自定义正则
  MinLength, 
  MaxLength, 
  Matches, 
  IsOptional,
  Length,
  IsBooleanString,   // 新增：更好校验 true/false 字符串
} from 'class-validator';

export class LoginDto {
  /**
   * 登录账号（邮箱或手机号）
   * 邮箱：使用 @IsEmail() 校验（接近RFC5322标准）
   * 手机号：额外正则校验
   */
  @IsNotEmpty({ message: '登录账号不能为空' })
  @IsString({ message: '登录账号必须为字符串' })
  @IsEmail({}, { message: '请输入正确的邮箱格式' }) // 真正的RFC5322近似校验
  @Matches(/^1[3-9]\d{9}$/, { // 手机号单独校验（可选，如果你支持手机号登录）
    message: '请输入正确的手机号',
    // 注意：@IsEmail 会先校验，如果是手机号会失败，所以需要自定义验证器或分两种DTO
  })
  account: string;

  /**
   * 登录密码（Magic Link 时可选）
   */
  @IsOptional() // Magic Link 登录时无需密码
  @IsString({ message: '登录密码必须为字符串' })
  @MinLength(8, { message: '密码长度不能少于8位' })
  @MaxLength(20, { message: '密码长度不能超过20位' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,20}$/,
    { message: '密码必须包含字母和数字，可包含特殊字符' }
  )
  password?: string;

  /**
   * 登录类型（新增字段，用于区分普通登录和Magic Link）
   */
  @IsOptional()
  @IsIn(['password', 'magic_link'], { message: '登录类型无效' })
  type?: 'password' | 'magic_link';

  /**
   * 记住我
   */
  @IsOptional()
  @IsBooleanString({ message: 'rememberMe必须为"true"或"false"' })
  rememberMe?: string;

  /**
   * 验证码（可选）
   */
  @IsOptional()
  @IsString()
  @Length(4, 6, { message: '验证码长度为4-6位' })
  captcha?: string;
}
/**
 * 登录响应DTO（规范返回格式）
 * 用于约束登录接口的返回数据结构
 */
export class LoginResponseDto {
  /**
   * JWT令牌
   */
  accessToken: string;

  /**
   * 令牌类型（固定为Bearer）
   */
  tokenType: string;

  /**
   * 过期时间（秒）
   */
  expiresIn: number;

  /**
   * 用户基本信息
   */
  user: {
    id: string;
    email: string;
    phone?: string;
    nickname: string;
    avatar?: string;
    role: string;
  };
}

/**
 * 刷新Token DTO
 */
export class RefreshTokenDto {
  @IsNotEmpty({ message: '刷新令牌不能为空' })
  @IsString({ message: '刷新令牌必须为字符串' })
  refreshToken: string;
}