import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AppConfig } from '../../config/app.config';

/**
 * 标准化响应结构
 * 前后端统一格式，便于前端解析
 */
interface StandardResponse<T = any> {
  success: boolean; // 接口是否成功
  code: number; // 业务状态码（默认复用HTTP状态码）
  data: T; // 响应数据（成功时返回）
  message: string; // 提示信息（成功/失败描述）
  requestId: string; // 请求ID（链路追踪）
  timestamp: string; // 响应时间
}

/**
 * 全局响应格式化拦截器
 * 1. 统一所有接口响应格式
 * 2. 自动填充请求ID、时间戳等元信息
 * 3. 适配成功/异常场景的格式统一
 * 4. 开发环境保留原始数据，生产环境精简
 */
@Injectable()
export class ResponseFormatInterceptor implements NestInterceptor {
  constructor(private readonly appConfig: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<StandardResponse> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    // 修复：处理headers可能为数组的情况，转为字符串
    const requestIdHeader = request.headers['x-request-id'];
    // 核心修复：将string|string[]转为string（数组取第一个值，无则生成新ID）
    const requestId = this.headerToString(requestIdHeader) || this.generateShortRequestId();
    
    // 响应头设置时确保是字符串
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      // 处理成功响应
      map((data) => this.formatSuccessResponse(request, response, data, requestId)),
      // 处理异常响应（仅兜底，优先由全局异常过滤器处理）
      catchError((error) => {
        const formattedError = this.formatErrorResponse(request, response, error, requestId);
        // 手动设置响应状态码
        response.status(formattedError.code);
        // 重新抛出异常，由全局异常过滤器最终处理
        throw formattedError;
      }),
    );
  }

  /**
   * 工具方法：将Header值（string|string[]）转为字符串
   * 解决核心类型错误：string[] 无法赋值给 string
   */
  private headerToString(headerValue: string | string[] | undefined): string | undefined {
    if (!headerValue) return undefined;
    // 数组则取第一个值，单个值直接返回
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  /**
   * 格式化成功响应
   */
  private formatSuccessResponse<T>(
    request: Request,
    response: Response,
    data: T,
    requestId: string,
  ): StandardResponse<T> {
    const statusCode = response.statusCode || HttpStatus.OK;
    const defaultMessage = this.getDefaultSuccessMessage(request.method);

    return {
      success: true,
      code: statusCode,
      data: this.appConfig.isDev ? data : this.simplifyData(data), // 生产环境精简数据
      message: defaultMessage,
      requestId: requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 格式化异常响应（兜底处理）
   */
  private formatErrorResponse(
    request: Request,
    response: Response,
    error: any,
    requestId: string,
  ): StandardResponse<null> {
    const statusCode = error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.appConfig.isDev 
      ? error.message || '服务器内部错误' 
      : this.getFriendlyErrorMessage(statusCode);

    return {
      success: false,
      code: statusCode,
      data: null,
      message: message,
      requestId: requestId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 生成简易请求ID（备用：当日志拦截器未生成时）
   */
  private generateShortRequestId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(16).substring(4);
  }

  /**
   * 获取默认成功提示语
   */
  private getDefaultSuccessMessage(method: string | undefined): string {
    if (!method) return '操作成功';
    const methodMap = {
      GET: '查询成功',
      POST: '创建成功',
      PUT: '更新成功',
      DELETE: '删除成功',
      PATCH: '修改成功',
    };
    return methodMap[method as keyof typeof methodMap] || '操作成功';
  }

  /**
   * 获取友好错误提示语
   */
  private getFriendlyErrorMessage(statusCode: number): string {
    const errorMap = {
      [HttpStatus.BAD_REQUEST]: '请求参数错误，请检查后重试',
      [HttpStatus.UNAUTHORIZED]: '登录状态已过期，请重新登录',
      [HttpStatus.FORBIDDEN]: '暂无权限访问该资源',
      [HttpStatus.NOT_FOUND]: '请求的资源不存在',
      [HttpStatus.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
      [HttpStatus.INTERNAL_SERVER_ERROR]: '服务器繁忙，请稍后再试',
    };
    return errorMap[statusCode as keyof typeof errorMap] || '操作失败，请稍后重试';
  }

  /**
   * 生产环境精简响应数据（移除空值/冗余字段）
   */
  private simplifyData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // 递归移除空值
    const simplified = Array.isArray(data) ? [] : {};
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value !== undefined && value !== null && value !== '') {
        simplified[key] = typeof value === 'object' ? this.simplifyData(value) : value;
      }
    });

    return simplified;
  }
}