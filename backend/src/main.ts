import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

// 根模块导入
import { AppModule } from './app.module';

/**
 * 自定义请求日志中间件
 * 记录：方法 URL 状态码 响应时间 内容长度 IP User-Agent
 * 不记录敏感信息（Token、请求体等）
 */
class RequestLoggerMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length') || '-';
      const duration = Date.now() - start;

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} ${duration}ms ${contentLength}b - ${userAgent} [${ip}]`,
      );
    });

    next();
  }
}

/**
 * 应用启动入口
 * 
 * 职责：
 * 1. 创建 Nest 应用实例
 * 2. 配置全局中间件（CORS、安全头、压缩、请求日志）
 * 3. 配置全局管道（参数验证）
 * 4. 启动 HTTP 服务
 * 
 * 注意：
 * - 全局过滤器/拦截器/守卫已在 app.module.ts 中通过 APP_* 令牌注册
 * - 不要在此处重复注册，避免双重执行
 */
async function bootstrap() {
  // ====================== 创建应用实例 ======================
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 根据环境设置日志级别
    logger: process.env.NODE_ENV === 'production' 
      ? ['error', 'warn', 'log'] 
      : ['error', 'warn', 'log', 'debug', 'verbose'],
    
    // 禁用默认 cors，后续自定义配置
    cors: false,
  });
  
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  // ====================== 添加请求日志中间件 ======================
  app.use(new RequestLoggerMiddleware().use);

  // ====================== CORS 配置 ======================
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    configService.get<string>('FRONTEND_DOMAIN'),
  ].filter(Boolean); // 移除 undefined 值

  app.enableCors({
    origin: (origin, callback) => {
      // 允许无 origin 的请求（如 Postman、服务器端请求）
      if (!origin) {
        return callback(null, true);
      }

      // 开发环境允许所有来源
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // 生产环境检查白名单
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Blocked by CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  });

  // ====================== 安全配置 ======================
  app.set('trust proxy', 1);

  // 可选：Helmet 安全头
  // if (configService.get<string>('ENABLE_HELMET') === 'true') {
  //   const helmet = require('helmet');
  //   app.use(helmet({
  //     contentSecurityPolicy: false,
  //     crossOriginEmbedderPolicy: false,
  //   }));
  // }

  // 可选：响应压缩
  // if (configService.get<string>('ENABLE_COMPRESSION') === 'true') {
  //   const compression = require('compression');
  //   app.use(compression());
  // }

  // ====================== 全局管道配置 ======================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((error) => ({
          field: error.property,
          constraints: error.constraints,
          value: error.value,
        }));
        
        return {
          statusCode: 400,
          message: 'Validation failed',
          errors: formattedErrors,
        };
      },
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // ====================== API 版本控制（可选） ======================
  // app.enableVersioning({
  //   type: VersioningType.URI,
  //   defaultVersion: '1',
  // });

  // ====================== 优雅关闭 ======================
  app.enableShutdownHooks();

  // ====================== 启动 HTTP 服务 ======================
  const port = configService.get<number>('PORT') || 3001;
  const host = configService.get<string>('HOST') || '0.0.0.0';
  const environment = configService.get<string>('NODE_ENV') || 'production';

  await app.listen(port, host);

  // ====================== 启动日志 ======================
  logger.log('========================================');
  logger.log(`✅ Application started successfully`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`🔗 Listening on: http://${host}:${port}`);
  logger.log(`📱 Frontend domain: ${configService.get<string>('FRONTEND_DOMAIN') || 'Not configured'}`);
  logger.log(`🔒 CORS allowed origins: ${allowedOrigins.join(', ')}`);
  logger.log(`🏥 Health check: http://${host}:${port}/health/ping`);
  logger.log('========================================');

  // ====================== 进程异常处理 ======================
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('❌ Unhandled Promise Rejection detected');
    logger.error('Reason:', reason);
    logger.error('Promise:', promise);
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('❌ Uncaught Exception detected');
    logger.error('Message:', error.message);
    logger.error('Stack:', error.stack);
    
    if (environment === 'production') {
      logger.error('🔄 Application will exit and restart...');
      setTimeout(() => process.exit(1), 1000);
    }
  });

  process.on('SIGTERM', async () => {
    logger.log('📡 SIGTERM signal received');
    logger.log('🔄 Closing HTTP server gracefully...');
    
    try {
      await app.close();
      logger.log('✅ HTTP server closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGINT', async () => {
    logger.log('📡 SIGINT signal received (Ctrl+C)');
    logger.log('🔄 Shutting down...');
    
    try {
      await app.close();
      logger.log('✅ Application closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
}

// ====================== 启动应用 ======================
bootstrap().catch((error: Error) => {
  const logger = new Logger('Bootstrap');
  logger.error('❌ Failed to start application');
  logger.error('Error:', error.message);
  logger.error('Stack:', error.stack);
  process.exit(1);
});