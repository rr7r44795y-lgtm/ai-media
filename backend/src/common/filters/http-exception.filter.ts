import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppConfig } from '../../config/app.config';

/**
 * 标准化错误响应结构
 * 前后端统一错误格式，便于前端解析
 */
interface StandardErrorResponse {
  success: boolean; // 固定为false
  code: number; // HTTP状态码/业务错误码
  message: string; // 用户友好提示
  details?: any; // 开发环境返回详细错误（生产环境隐藏）
  timestamp: string; // 错误发生时间
  path: string; // 触发错误的接口路径
}

/**
 * 全局HTTP异常过滤器
 * 捕获所有HttpException及未处理的异常，返回标准化响应
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly appConfig: AppConfig) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. 基础错误信息提取
    const status = exception.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception.getResponse();
    const isProd = this.appConfig.isProd; // ✅ 修正：通过appConfig读取

    // 2. 解析错误信息（兼容Nest内置异常和自定义异常）
    let message = '服务器内部错误';
    let details: any = null;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      // 处理Nest内置的结构化异常（如ValidationError）
      message = (exceptionResponse as any).message || message;
      details = isProd ? null : (exceptionResponse as any).details || exceptionResponse;
    } else if (typeof exceptionResponse === 'string') {
      // 处理字符串类型的异常信息
      message = exceptionResponse;
      details = isProd ? null : exception.stack;
    } else {
      // 兜底处理未知异常格式
      message = exception.message || message;
      details = isProd ? null : exception.stack;
    }

    // 3. 标准化错误响应
    const errorResponse: StandardErrorResponse = {
      success: false,
      code: status,
      message: this.getFriendlyMessage(status, message),
      details: details, // 生产环境隐藏详细信息
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // 4. 日志记录（分级打印，生产环境仅记录错误级别）
    this.logError(exception, request, status);

    // 5. 返回响应
    response.status(status).json(errorResponse);
  }

  /**
   * 获取用户友好的错误提示（替换技术术语，提升用户体验）
   * @param status HTTP状态码
   * @param originalMessage 原始错误信息
   */
  private getFriendlyMessage(status: number, originalMessage: string): string {
    const isProd = this.appConfig.isProd; // ✅ 修正：通过appConfig读取
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return '登录状态已过期，请重新登录';
      case HttpStatus.FORBIDDEN:
        return '您暂无权限访问该资源，请升级套餐或联系管理员';
      case HttpStatus.NOT_FOUND:
        return '请求的资源不存在';
      case HttpStatus.BAD_REQUEST:
        return `请求参数错误：${originalMessage}`;
      case HttpStatus.TOO_MANY_REQUESTS:
        return '请求过于频繁，请稍后再试';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return isProd ? '服务器繁忙，请稍后再试' : originalMessage;
      default:
        return originalMessage || '操作失败，请稍后重试';
    }
  }

  /**
   * 分级日志记录
   * @param exception 异常实例
   * @param request 请求对象
   * @param status HTTP状态码
   */
  private logError(exception: HttpException, request: Request, status: number): void {
    const isProd = this.appConfig.isProd; // ✅ 修正：通过appConfig读取
    const logData = {
      method: request.method,
      path: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: (request as any).user?.id || '未登录', // 记录触发错误的用户ID
      status,
      message: exception.message,
    };

    // 生产环境仅记录5xx错误，开发环境记录所有错误
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`[${status}] ${exception.message}`, logData);
    } else if (!isProd) {
      this.logger.warn(`[${status}] ${exception.message}`, logData);
    }
  }
}

/**
 * 全局未捕获异常过滤器（兜底处理所有非HttpException的异常）
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly appConfig: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 解析未知异常
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const isProd = this.appConfig.isProd; // ✅ 修正：通过appConfig读取
    const message = isProd ? '服务器繁忙，请稍后再试' : (exception as Error).message;
    const details = isProd ? null : (exception as Error).stack;

    // 标准化响应
    const errorResponse: StandardErrorResponse = {
      success: false,
      code: status,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // 记录致命错误日志
    this.logger.error(`[UNCAUGHT] ${(exception as Error).message}`, {
      method: request.method,
      path: request.url,
      ip: request.ip,
      userId: (request as any).user?.id || '未登录',
      stack: (exception as Error).stack,
    });

    // 返回500响应
    response.status(status).json(errorResponse);
  }
}