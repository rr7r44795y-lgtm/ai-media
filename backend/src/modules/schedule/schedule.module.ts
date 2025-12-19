/**
 * 定时任务模块配置
 * 路径：src/modules/schedule/schedule.module.ts
 * 使用 Supabase 作为数据层 + NestJS Schedule 定时任务
 */
import { Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';

import { ScheduleController } from './schedule.controller';
import { ScheduleScannerService } from './cron/schedule-scanner';
import { ContentModule } from '../content/content.module';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [
    // 初始化 NestJS 定时任务
    NestScheduleModule.forRoot(),

    // 依赖业务模块（内容 + 平台）
    ContentModule,
    PlatformModule,
  ],
  controllers: [ScheduleController],
  providers: [
    ScheduleScannerService, // 定时扫描 + 执行任务
  ],
  exports: [
    ScheduleScannerService, // 供其他模块手动触发任务
  ],
})
export class ScheduleModule {}