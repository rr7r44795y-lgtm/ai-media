/**
 * 定时任务模块核心配置
 * 路径：cron/cron.module.ts
 * 基于 NestJS Schedule 模块，适配项目已有架构，无跨模块强依赖
 */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule'; // NestJS官方定时任务模块
import { ConfigModule } from '@nestjs/config'; // 复用全局配置模块

// 本模块核心组件（后续创建的定时任务服务/控制器均在此注册）
import { CronService } from './cron.service';
import { CronController } from './cron.controller'; // 可选：定时任务管理控制器（启停/查看任务）

@Module({
  /**
   * 导入依赖模块（仅项目已有核心依赖）
   */
  imports: [
    // 1. 定时任务核心模块：注册后可使用 @Cron/@Interval/@Timeout 装饰器
    ScheduleModule.forRoot(),

    // 2. 配置模块：复用全局ConfigModule，读取.env中的定时任务配置（如任务开关/执行时间）
    ConfigModule,
  ],

  /**
   * 注册控制器（可选：对外暴露定时任务管理API，如手动触发/查看任务状态）
   */
  controllers: [CronController],

  /**
   * 注册定时任务服务（核心业务逻辑，所有定时任务均在此实现）
   */
  providers: [CronService],

  /**
   * 导出核心组件（供其他模块复用定时任务能力）
   */
  exports: [
    ScheduleModule, // 供其他模块注册局部定时任务
    CronService,    // 供其他模块调用定时任务逻辑（如手动触发）
  ],
})
export class CronModule {}