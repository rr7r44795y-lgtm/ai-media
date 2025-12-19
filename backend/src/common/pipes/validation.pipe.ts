import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AppConfig } from '../../config/app.config';

/**
 * 标准化校验错误结构
 */
interface ValidationErrorResponse {
  success: boolean;
  code: number;
  message: string;
  details: Array<{
    field: string; // 错误字段名
    errors: string[]; // 该字段的所有错误提示
  }>;
  timestamp: string;
}

/**
 * 全局参数校验管道
 * 1. 使用class-validator校验请求参数（Body/Query/Param）
 * 2. 格式化校验错误，返回用户友好提示
 * 3. 开发环境显示详细错误，生产环境精简提示
 * 4. 支持自动类型转换（class-transformer）
 */
@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  constructor(private readonly appConfig: AppConfig) {}

  // 修复：明确transform方法的返回类型，参数类型强校验
  async transform(value: unknown, { metatype, type }: ArgumentMetadata): Promise<unknown> {
    // 1. 非类类型（如string/number）无需校验，直接返回
    if (!metatype || !this.isClass(metatype)) {
      return value;
    }

    try {
      // 2. 将原始数据转换为类实例（支持类型转换，如string转number）
      // 修复：value可能为unknown，先转为any（安全转换，因plainToInstance支持任意输入）
      const object = plainToInstance(metatype, value as any, {
        enableImplicitConversion: true, // 自动类型转换（如"123"转123）
        excludeExtraneousValues: true, // 剔除类中未定义的字段
      });

      // 3. 执行校验
      const errors = await validate(object, {
        skipMissingProperties: false, // 不跳过必填字段缺失的情况
        whitelist: true, // 剔除未添加校验装饰器的字段
        forbidNonWhitelisted: true, // 存在未白名单字段时抛出错误
        validationError: {
          target: false, // 不返回目标对象（减少冗余）
          value: this.appConfig.isDev, // 开发环境返回错误字段值，生产环境隐藏
        },
      });

      // 4. 无错误则返回转换后的对象
      if (errors.length === 0) {
        return object;
      }

      // 5. 格式化错误并抛出异常
      // 修复：确保paramType是字符串（type的类型是'body'|'query'|'param'|'custom'）
      const paramType = type as string;
      throw new BadRequestException(this.formatValidationErrors(errors, paramType));
    } catch (error) {
      // 兜底处理转换/校验过程中的未知错误
      const errorMsg = error instanceof Error ? error.message : '参数校验失败';
      throw new BadRequestException({
        success: false,
        code: HttpStatus.BAD_REQUEST,
        message: this.appConfig.isDev ? errorMsg : '请求参数错误，请检查后重试',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * 判断是否为类类型（区分普通类型和DTO类）
   * 修复：明确metatype的类型，避免unknown赋值给string
   */
  private isClass(metatype: unknown): boolean {
    // 先校验基础类型，避免类型错误
    if (typeof metatype !== 'function') {
      return false;
    }

    const types = [String, Boolean, Number, Array, Object];
    // 修复：确保metatype不在基础类型数组中
    return !types.some(t => t === metatype) && !!metatype.prototype;
  }

  /**
   * 格式化校验错误为标准化响应
   */
  private formatValidationErrors(errors: ValidationError[], paramType: string): ValidationErrorResponse {
    // 解析错误详情
    const details = errors.map((error) => ({
      field: error.property,
      errors: this.extractErrorMessages(error),
    }));

    // 基础错误信息（确保paramType是字符串）
    const baseMessage = this.appConfig.isDev
      ? `${paramType || '请求'}参数校验失败`
      : '请求参数错误，请检查后重试';

    return {
      success: false,
      code: HttpStatus.BAD_REQUEST,
      message: baseMessage,
      details: this.appConfig.isDev ? details : this.simplifyErrorDetails(details),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 提取单个字段的所有错误提示
   * 修复：确保返回的都是字符串数组
   */
  private extractErrorMessages(error: ValidationError): string[] {
    const messages: string[] = [];

    // 处理嵌套字段错误（如user.name）
    if (error.children && error.children.length > 0) {
      error.children.forEach((child) => {
        const childMessages = this.extractErrorMessages(child);
        messages.push(...childMessages.map(msg => `${error.property}.${msg}`));
      });
    }

    // 处理当前字段错误（确保constraints的值是字符串）
    if (error.constraints) {
      const constraints = Object.values(error.constraints);
      messages.push(...constraints.map(c => c as string));
    }

    return messages;
  }

  /**
   * 生产环境精简错误详情（仅返回第一个错误，避免信息过载）
   */
  private simplifyErrorDetails(details: Array<{ field: string; errors: string[] }>): Array<{ field: string; errors: string[] }> {
    if (details.length === 0) return [];
    // 仅返回第一个字段的第一个错误（确保都是字符串）
    return [{
      field: details[0].field,
      errors: [details[0].errors[0] || '参数格式错误'],
    }];
  }
}