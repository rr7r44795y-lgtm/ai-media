import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
// 修复：使用Nest内置的uuid工具（无需额外安装依赖）
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../../config/app.config';

// 修复：扩展Express Request类型，添加user和x-request-id属性
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        subscriptionPlan?: string;
        isVerified: boolean;
        createdAt: string;
      };
      headers: {
        'x-request-id'?: string;
        [key: string]: any;
      };
    }
  }
}

/**
 * 日志数据结构
 * 包含请求/响应全量信息，便于问题排查
 */
interface RequestLog {
  requestId: string; // 唯一请求ID（链路追踪）
  timestamp: string; // 请求时间
  method: string; // HTTP方法
  path: string; // 请求路径
  ip: string; // 客户端IP
  userAgent: string; // 客户端UA
  userId: string | '未登录'; // 当前用户ID
  requestBody: any; // 请求体（过滤敏感信息）
  requestQuery: any; // 请求参数
  requestHeaders: Record<string, string>; // 请求头（过滤敏感信息）
  statusCode: number; // 响应状态码
  responseBody: any; // 响应体
  duration: number; // 接口耗时（毫秒）
  env: string; // 运行环境
  error?: string; // 错误信息（可选）
  stack?: string; // 错误堆栈（可选）
}

/**
 * 全局日志拦截器
 * 1. 记录请求/响应全量信息
 * 2. 过滤敏感数据（密码/Token）
 * 3. 差异化日志输出（开发环境详细，生产环境精简）
 * 4. 链路追踪（requestId）
 */
@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggerInterceptor.name);
  private readonly sensitiveFields = ['password', 'token', 'authorization', 'secret', 'key']; // 敏感字段列表

  constructor(private readonly appConfig: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 1. 初始化请求上下文
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = uuidv4(); // 生成唯一请求ID
    const startTime = Date.now();

    // 2. 给请求挂载requestId（便于链路追踪）
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);

    // 3. 提取基础请求信息（修复：确保requestId必传）
    const baseLog = this.extractBaseRequestInfo(request, requestId);

    // 4. 开发环境打印请求入参（生产环境仅记录关键信息）
    if (this.appConfig.isDev) {
      this.logger.debug(`[${requestId}] 请求开始`, {
        method: baseLog.method,
        path: baseLog.path,
        userId: baseLog.userId,
      });
    }

    // 5. 监听响应完成，记录日志
    return next.handle().pipe(
      tap({
        // 响应成功
        next: (responseBody) => {
          const duration = Date.now() - startTime;
          this.logRequestComplete(baseLog, request, response, responseBody, duration);
        },
        // 响应异常
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logRequestError(baseLog, request, response, error, duration);
        },
      }),
    );
  }

  /**
   * 提取基础请求信息（过滤敏感字段）
   * 修复：确保所有必填字段都有值，requestId必传
   */
  private extractBaseRequestInfo(request: Request, requestId: string): RequestLog {
    // 获取当前用户ID（未登录则为"未登录"）
    const userId = request.user?.id || '未登录';

    // 过滤请求头中的敏感字段
    const filteredHeaders = this.filterSensitiveData(request.headers) as Record<string, string>;

    return {
      requestId: requestId, // 修复：明确赋值，确保非undefined
      timestamp: new Date().toISOString(),
      method: request.method || 'GET',
      path: request.url || '',
      ip: this.getClientIp(request),
      userAgent: request.headers['user-agent'] || '',
      userId: userId,
      requestQuery: request.query || {},
      requestHeaders: filteredHeaders,
      requestBody: this.filterSensitiveData(request.body) || {},
      statusCode: 200, // 初始值，后续会覆盖
      responseBody: {}, // 初始值，后续会覆盖
      duration: 0, // 初始值，后续会覆盖
      env: this.appConfig.env || 'production',
    };
  }

  /**
   * 获取客户端真实IP（适配反向代理场景，如Render/Vercel）
   */
  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string) || // 反向代理透传的IP
      request.ip ||
      request.ips[0] ||
      'unknown'
    );
  }

  /**
   * 过滤敏感数据（替换为***）
   */
  private filterSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const filtered = { ...data };
    Object.keys(filtered).forEach((key) => {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveFields.some((field) => lowerKey.includes(field))) {
        filtered[key] = '***';
      }
    });

    return filtered;
  }

  /**
   * 记录请求成功日志
   */
  private logRequestComplete(
    baseLog: RequestLog,
    request: Request,
    response: Response,
    responseBody: any,
    duration: number,
  ): void {
    const statusCode = response.statusCode || 200;
    const logData: RequestLog = {
      ...baseLog,
      statusCode,
      responseBody: this.filterSensitiveData(responseBody),
      duration,
    };

    // 分级日志：2xx/3xx → debug（开发）/info（生产）；4xx → warn；5xx → error
    if (statusCode >= 500) {
      this.logger.error(`[${baseLog.requestId}] 请求失败 (${duration}ms)`, logData);
    } else if (statusCode >= 400) {
      this.logger.warn(`[${baseLog.requestId}] 请求异常 (${duration}ms)`, logData);
    } else if (this.appConfig.isProd) {
      this.logger.log(`[${baseLog.requestId}] 请求成功 (${duration}ms)`, {
        method: baseLog.method,
        path: baseLog.path,
        statusCode,
        userId: baseLog.userId,
        duration,
      });
    } else {
      this.logger.debug(`[${baseLog.requestId}] 请求成功 (${duration}ms)`, logData);
    }
  }

  /**
   * 记录请求异常日志
   * 修复：类型兼容，错误信息合并到RequestLog中
   */
  private logRequestError(
    baseLog: RequestLog,
    request: Request,
    response: Response,
    error: any,
    duration: number,
  ): void {
    const statusCode = response.statusCode || 500;
    const logData: RequestLog = {
      ...baseLog,
      statusCode,
      responseBody: { error: error.message || '未知错误' },
      duration,
      error: error.message || '未知错误',
      stack: this.appConfig.isDev ? error.stack : undefined, // 生产环境隐藏堆栈
    };

    this.logger.error(`[${baseLog.requestId}] 请求异常 (${duration}ms)`, logData);
  }
}