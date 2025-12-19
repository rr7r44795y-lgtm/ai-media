import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HttpHealthIndicator, HealthCheck } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
  ) {}

  @Get('ping')
  @HealthCheck()
  ping() {
    return this.health.check([
      // 简单存活探测
      () => this.http.pingCheck('nestjs-docs', 'https://docs.nestjs.com'),
      // 你可以添加更多检查，例如数据库连接
      // () => this.db.pingCheck('database'),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    // 就绪检查：用于判断是否可以接收流量（可添加数据库、缓存等依赖检查）
    return this.health.check([]);
  }

  @Get('live')
  @HealthCheck()
  liveness() {
    // 存活检查：用于判断容器是否需要重启（通常只检查进程是否活着）
    return { status: 'up' };
  }
}