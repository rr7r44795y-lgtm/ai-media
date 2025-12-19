/**
 * 通用日志工具类
 * 扩展NestJS原生日志，支持：
 * 1. 多级别日志（debug/info/warn/error/fatal）
 * 2. JSON格式（生产）/ 彩色文本（开发）
 * 3. 自定义日志上下文
 * 4. 错误堆栈捕获
 * 5. 与全局拦截器日志联动
 */
import { Logger as NestLogger, LoggerService } from '@nestjs/common';
import { AppConfig } from '../../config/app.config';

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * 日志选项
 */
interface LogOptions {
  context?: string; // 日志上下文（模块/服务名）
  requestId?: string; // 请求ID（与拦截器联动）
  data?: Record<string, any>; // 附加数据
  error?: Error; // 错误对象（自动捕获堆栈）
}

/**
 * 通用日志工具（正确实现LoggerService接口）
 */
export class Logger implements LoggerService {
  private readonly nestLogger: NestLogger;
  private readonly appConfig: AppConfig;
  private readonly defaultContext = 'App';
  // 新增：暴露上下文（解决protected问题）
  private currentContext: string;

  constructor(appConfig: AppConfig, context?: string) {
    this.appConfig = appConfig;
    this.currentContext = context || this.defaultContext;
    // 初始化Nest Logger，使用当前上下文
    this.nestLogger = new NestLogger(this.currentContext);
  }

  /**
   * 实现LoggerService的log方法（必填）
   * @param message 日志信息
   * @param context 上下文（可选）
   */
  log(message: string, context?: string): void;
  log(message: any, context?: string): void;
  log(message: any, context?: string): void {
    // 兼容Nest原生调用方式
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.info(msg, { context: context || this.currentContext });
  }

  /**
   * 调试日志（仅开发环境输出）
   * @param message 日志信息
   * @param options 日志选项
   */
  debug(message: string, options: LogOptions = {}): void {
    if (!this.appConfig.isDev) return; // 生产环境禁用debug日志

    const logData = this.formatLog('debug', message, options);
    this.nestLogger.debug(this.formatOutput(logData));
  }

  /**
   * 信息日志
   * @param message 日志信息
   * @param options 日志选项
   */
  info(message: string, options: LogOptions = {}): void {
    const logData = this.formatLog('info', message, options);
    this.nestLogger.log(this.formatOutput(logData));
  }

  /**
   * 实现LoggerService的warn方法（必填）
   * @param message 日志信息
   * @param context 上下文（可选）
   */
  warn(message: string, context?: string): void;
  warn(message: any, context?: string): void;
  warn(message: any, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.warnLog(msg, { context: context || this.currentContext });
  }

  /**
   * 警告日志（内部方法，避免与接口方法冲突）
   * @param message 日志信息
   * @param options 日志选项
   */
  private warnLog(message: string, options: LogOptions = {}): void {
    const logData = this.formatLog('warn', message, options);
    this.nestLogger.warn(this.formatOutput(logData));
  }

  /**
   * 实现LoggerService的error方法（必填）
   * @param message 日志信息
   * @param trace 错误堆栈（可选）
   * @param context 上下文（可选）
   */
  error(message: string, trace?: string, context?: string): void;
  error(message: any, trace?: string, context?: string): void;
  error(message: any, trace?: string, context?: string): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.errorLog(msg, {
      context: context || this.currentContext,
      error: trace ? new Error(`${msg}\n${trace}`) : new Error(msg),
    });
  }

  /**
   * 错误日志（内部方法，避免与接口方法冲突）
   * @param message 日志信息
   * @param options 日志选项（必填error对象）
   */
  private errorLog(message: string, options: LogOptions & { error?: Error } = {}): void {
    const logData = this.formatLog('error', message, {
      ...options,
      error: options.error || new Error(message),
    });
    this.nestLogger.error(this.formatOutput(logData));
  }

  /**
   * 致命错误日志
   * @param message 日志信息
   * @param options 日志选项（必填error对象）
   */
  fatal(message: string, options: LogOptions & { error: Error }): void {
    const logData = this.formatLog('fatal', message, options);
    this.nestLogger.error(this.formatOutput(logData));
    // 致命错误可选择退出进程（生产环境）
    if (this.appConfig.isProd) {
      setTimeout(() => process.exit(1), 1000);
    }
  }

  /**
   * 格式化日志数据
   */
  private formatLog(level: LogLevel, message: string, options: LogOptions): Record<string, any> {
    // 使用自定义上下文，避免访问Nest Logger的protected属性
    const logContext = options.context || this.currentContext;
    
    const logData = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      context: logContext,
      requestId: options.requestId || 'unknown',
      message,
      ...(options.data ? { data: options.data } : {}),
    };

    // 附加错误信息（含堆栈）
    if (options.error) {
      logData['error'] = {
        name: options.error.name,
        message: options.error.message,
        stack: this.appConfig.isDev ? options.error.stack : undefined, // 生产环境隐藏堆栈
      };
    }

    return logData;
  }

  /**
   * 格式化输出（开发：彩色文本，生产：JSON）
   */
  private formatOutput(logData: Record<string, any>): string {
    // 生产环境输出JSON格式（便于日志收集工具解析）
    if (this.appConfig.isProd) {
      return JSON.stringify(logData);
    }

    // 开发环境输出彩色文本（便于阅读）
    const colors = {
      debug: '\x1b[36m', // 青色
      info: '\x1b[32m', // 绿色
      warn: '\x1b[33m', // 黄色
      error: '\x1b[31m', // 红色
      fatal: '\x1b[41m', // 红底白字
      reset: '\x1b[0m', // 重置颜色
    };

    const levelColor = colors[logData.level.toLowerCase() as LogLevel] || colors.reset;
    const baseLog = `${levelColor}[${logData.timestamp}] [${logData.level}] [${logData.context}] [${logData.requestId}] ${logData.message}${colors.reset}`;

    // 附加数据格式化
    let extraLog = '';
    if (logData.data) {
      extraLog += `\n  Data: ${JSON.stringify(logData.data, null, 2)}`;
    }
    if (logData.error) {
      extraLog += `\n  Error: ${logData.error.message}`;
      if (logData.error.stack) {
        extraLog += `\n  Stack: ${logData.error.stack}`;
      }
    }

    return baseLog + extraLog;
  }

  /**
   * 静态创建日志实例
   */
  static create(appConfig: AppConfig, context?: string): Logger {
    return new Logger(appConfig, context);
  }
}

/**
 * 全局日志实例（需在应用启动时初始化）
 */
export let globalLogger: Logger;

/**
 * 初始化全局日志
 * @param appConfig AppConfig实例
 */
export function initGlobalLogger(appConfig: AppConfig): void {
  globalLogger = Logger.create(appConfig);
}