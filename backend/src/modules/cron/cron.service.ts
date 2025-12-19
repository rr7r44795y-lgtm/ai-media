/**
 * 定时任务核心服务
 * 路径：cron/cron.service.ts
 * 适配常见业务场景，无跨模块强依赖
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval, Timeout } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config'; // 读取.env配置

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly configService: ConfigService, // 注入配置服务
  ) {}

  /**
   * 示例1：每日凌晨1点执行（清理内容回收站超过30天的内容）
   * 适配content模块业务，无强依赖（通过模块导出的Service调用）
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM) // 或自定义表达式：'0 1 * * *'
  async cleanExpiredContent() {
    try {
      const isEnabled = this.configService.get<boolean>('CRON_CLEAN_CONTENT_ENABLED', true);
      if (!isEnabled) {
        this.logger.log('【定时任务】清理回收站内容：任务已禁用');
        return;
      }

      // 核心逻辑：调用content模块的Service（后续创建关联时取消注释）
      // const expiredDays = this.configService.get<number>('CRON_CLEAN_CONTENT_DAYS', 30);
      // await this.contentService.forceDeleteExpiredContent(expiredDays);

      this.logger.log(`【定时任务】清理回收站内容：成功执行（清理超过30天的内容）`);
    } catch (error) {
      this.logger.error(`【定时任务】清理回收站内容：执行失败 → ${error.message}`);
    }
  }

  /**
   * 示例2：每小时执行（更新内容阅读量统计）
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateContentViewCount() {
    try {
      this.logger.log(`【定时任务】更新内容阅读量统计：成功执行`);
      // 业务逻辑：调用content模块统计阅读量
    } catch (error) {
      this.logger.error(`【定时任务】更新内容阅读量统计：执行失败 → ${error.message}`);
    }
  }

  /**
   * 示例3：固定间隔执行（每5分钟检查内容发布状态）
   * 单位：毫秒，5分钟=300000ms
   */
  @Interval(300000)
  async checkContentPublishStatus() {
    try {
      this.logger.log(`【定时任务】检查内容发布状态：成功执行`);
      // 业务逻辑：检查定时发布的内容，自动更新状态
    } catch (error) {
      this.logger.error(`【定时任务】检查内容发布状态：执行失败 → ${error.message}`);
    }
  }

  /**
   * 示例4：延迟执行（应用启动后10秒初始化定时任务）
   * 单位：毫秒，10秒=10000ms
   */
  @Timeout(10000)
  async initCronTasks() {
    this.logger.log(`【定时任务】初始化完成：所有定时任务已启动`);
  }

  /**
   * 手动触发定时任务（供控制器调用）
   * @param taskName 任务名称
   */
  async triggerTask(taskName: string) {
    switch (taskName) {
      case 'cleanExpiredContent':
        await this.cleanExpiredContent();
        break;
      case 'updateContentViewCount':
        await this.updateContentViewCount();
        break;
      case 'checkContentPublishStatus':
        await this.checkContentPublishStatus();
        break;
      default:
        throw new Error(`定时任务【${taskName}】不存在`);
    }
    this.logger.log(`【定时任务】手动触发：${taskName} 执行完成`);
  }
}