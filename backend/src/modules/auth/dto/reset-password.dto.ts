/**
 * 密码重置相关DTO
 * 覆盖「发送验证码→验证验证码→重置密码」全流程参数校验
 * 适配社交排程SaaS场景的安全规范
 */
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  Length,
  Matches,
  IsOptional,
  ValidateIf,
  Equals,
} from 'class-validator';

/**
 * 发送重置密码验证码DTO
 * 校验接收验证码的邮箱合法性
 */
export class SendResetPasswordCaptchaDto {
  /**
   * 重置密码的邮箱（必须与注册邮箱一致）
   */
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @Length(5, 100, { message: '邮箱长度需在5-100位之间' })
  email: string;

  /**
   * 图形验证码（可选，防止恶意发送验证码）
   * 生产环境建议开启，开发环境可忽略
   */
  @IsOptional()
  @IsString({ message: '图形验证码必须为字符串' })
  @Length(4, 6, { message: '图形验证码长度为4-6位' })
  graphicCaptcha?: string;
}

/**
 * 验证重置密码验证码DTO
 * 校验邮箱+验证码的合法性
 */
export class VerifyCaptchaDto {
  /**
   * 重置密码的邮箱
   */
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  email: string;

  /**
   * 短信/邮箱验证码（6位数字）
   */
  @IsNotEmpty({ message: '验证码不能为空' })
  @IsString({ message: '验证码必须为字符串' })
  @Length(6, 6, { message: '验证码必须为6位数字' })
  @Matches(/^\d{6}$/, { message: '验证码仅支持6位数字' })
  captcha: string;
}

/**
 * 重置密码DTO
 * 校验临时令牌+新密码的合法性，确保密码强度
 */
export class ResetPasswordDto {
  /**
   * 验证验证码后返回的临时令牌（有效期10分钟）
   * 用于确认用户身份，防止跨站请求伪造
   */
  @IsNotEmpty({ message: '临时令牌不能为空' })
  @IsString({ message: '临时令牌必须为字符串' })
  @Length(32, 128, { message: '临时令牌格式错误' })
  tempToken: string;

  /**
   * 新密码（强密码规则）
   * 8-20位，包含字母+数字+特殊字符，避免弱密码
   */
  @IsNotEmpty({ message: '新密码不能为空' })
  @IsString({ message: '新密码必须为字符串' })
  @Length(8, 20, { message: '新密码长度需在8-20位之间' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    {
      message:
        '新密码必须包含字母、数字和特殊字符（@$!%*?&），且不能包含空格',
    },
  )
  newPassword: string;

  /**
   * 确认新密码（必须与新密码一致）
   */
  @IsNotEmpty({ message: '确认密码不能为空' })
  @IsString({ message: '确认密码必须为字符串' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    {
      message:
        '确认密码必须包含字母、数字和特殊字符（@$!%*?&），且不能包含空格',
    },
  )
  confirmPassword: string;

  /**
   * 密码重置原因（可选，用于日志分析）
   */
  @IsOptional()
  @IsString({ message: '重置原因必须为字符串' })
  @Length(0, 200, { message: '重置原因长度不能超过200位' })
  reason?: string;
}

/**
 * 找回密码（无需旧密码）DTO
 * 适配用户忘记旧密码的场景，与重置密码流程复用
 */
export class FindPasswordDto extends VerifyCaptchaDto {
  /**
   * 新密码（同重置密码规则）
   */
  @IsNotEmpty({ message: '新密码不能为空' })
  @IsString({ message: '新密码必须为字符串' })
  @Length(8, 20, { message: '新密码长度需在8-20位之间' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    {
      message:
        '新密码必须包含字母、数字和特殊字符（@$!%*?&），且不能包含空格',
    },
  )
  newPassword: string;

  /**
   * 确认新密码
   */
  @IsNotEmpty({ message: '确认密码不能为空' })
  @IsString({ message: '确认密码必须为字符串' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    {
      message:
        '确认密码必须包含字母、数字和特殊字符（@$!%*?&），且不能包含空格',
    },
  )
  confirmPassword: string;
}

/**
 * 修改密码（需旧密码）DTO
 * 适配用户已知旧密码，主动修改密码的场景
 */
export class ChangePasswordDto {
  /**
   * 旧密码（验证用户身份）
   */
  @IsNotEmpty({ message: '旧密码不能为空' })
  @IsString({ message: '旧密码必须为字符串' })
  oldPassword: string;

  /**
   * 新密码（同重置密码规则）
   */
  @IsNotEmpty({ message: '新密码不能为空' })
  @IsString({ message: '新密码必须为字符串' })
  @Length(8, 20, { message: '新密码长度需在8-20位之间' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    {
      message:
        '新密码必须包含字母、数字和特殊字符（@$!%*?&），且不能包含空格',
    },
  )
  newPassword: string;

  /**
   * 确认新密码
   */
  @IsNotEmpty({ message: '确认密码不能为空' })
  @IsString({ message: '确认密码必须为字符串' })
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]{8,20}$/,
    {
      message:
        '确认密码必须包含字母、数字和特殊字符（@$!%*?&），且不能包含空格',
    },
  )
  confirmPassword: string;
}