/**
 * 定时任务扫描器
 * 路径：src/modules/schedule/cron/schedule-scanner.service.ts
 * 每分钟扫描待执行排程，支持乐观锁 + 重试 + Worker 分发
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseConfig } from 'src/config/supabase.config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const MAX_CONCURRENT_TASKS = 20; // 同时处理最多20个任务
const MAX_RETRY_COUNT = 4;
const RETRY_DELAYS = [60, 300, 900, 3600]; // 秒

@Injectable()
export class ScheduleScannerService {
  private readonly logger = new Logger(ScheduleScannerService.name);
  private readonly supabase;

  constructor(
    private readonly supabaseConfig: SupabaseConfig,
    private readonly httpService: HttpService, // 用于调用内部 Worker API
  ) {
    this.supabase = this.supabaseConfig.getClient();
  }

  /**
   * 每分钟执行一次扫描
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanPendingSchedules() {
    this.logger.log('【排程扫描器】开始扫描待执行任务');

    const now = new Date().toISOString();

    try {
      // 1. 查询待执行任务（pending 或需要重试）
      const { data: tasks, error } = await this.supabase
        .from('schedules')
        .select('id, content_id, platform, user_id, tries')
        .in('status', ['pending', 'failed'])
        .lte('next_retry_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(MAX_CONCURRENT_TASKS);

      if (error || !tasks || tasks.length === 0) {
        this.logger.log('【排程扫描器】无待执行任务');
        return;
      }

      this.logger.log(`【排程扫描器】发现 ${tasks.length} 个待执行任务，开始处理`);

      // 2. 逐个任务使用乐观锁标记为 processing
      for (const task of tasks) {
        await this.processTaskWithOptimisticLock(task);
      }
    } catch (error) {
      this.logger.error(`【排程扫描器】扫描失败：${error.message}`);
    }
  }

  /**
   * 使用乐观锁处理单个任务
   */
  private async processTaskWithOptimisticLock(task: any) {
    try {
      // 乐观锁：只有 status 为 pending 且未被其他实例处理时才能更新
      const { data, error } = await this.supabase
        .from('schedules')
        .update({
          status: 'processing',
          tries: task.tries + 1,
          updated_at: new Date(),
        })
        .eq('id', task.id)
        .eq('status', task.tries === 0 ? 'pending' : 'failed') // 首次或重试
        .select()
        .single();

      if (error || !data) {
        this.logger.warn(`任务 ${task.id} 已被其他实例处理，跳过`);
        return;
      }

      this.logger.log(`任务 ${task.id} 已标记为 processing，开始分发到 Worker`);

      // 3. 分发到 Worker（内部 API）
      await this.dispatchToWorker(task);

      // 4. Worker 执行成功后会回调更新状态，这里不处理（异步解耦）
    } catch (error) {
      this.logger.error(`处理任务 ${task.id} 失败：${error.message}`);
      // 不回滚状态，让下次扫描重试
    }
  }

  /**
   * 分发任务到 Worker API
   */
  private async dispatchToWorker(task: any) {
    const workerPayload = {
      scheduleId: task.id,
      contentId: task.content_id,
      platform: task.platform,
      userId: task.user_id,
    };

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.configService.get('APP_DOMAIN')}/api/worker/publish`,
          workerPayload,
          { timeout: 10000 },
        ),
      );
      this.logger.log(`任务 ${task.id} 已成功分发到 Worker`);
    } catch (error) {
      this.logger.error(`分发任务 ${task.id} 到 Worker 失败：${error.message}`);
      // 失败后状态仍为 processing，下次扫描会重试或标记 failed
      throw error;
    }
  }

  /**
   * Worker 回调：更新任务状态（成功）
   */
  async markScheduleAsSuccess(scheduleId: string, publishedUrl?: string) {
    const { error } = await this.supabase
      .from('schedules')
      .update({
        status: 'success',
        published_url: publishedUrl,
        updated_at: new Date(),
      })
      .eq('id', scheduleId);

    if (error) {
      this.logger.error(`标记任务 ${scheduleId} 成功失败：${error.message}`);
    } else {
      this.logger.log(`任务 ${scheduleId} 执行成功`);
    }
  }

  /**
   * Worker 回调：更新任务状态（失败）
   */
  async markScheduleAsFailed(scheduleId: string, errorMsg: string) {
    const { data: task } = await this.supabase
      .from('schedules')
      .select('tries')
      .eq('id', scheduleId)
      .single();

    const newTries = (task?.tries || 0) + 1;
    const shouldRetry = newTries < MAX_RETRY_COUNT;

    const updateData: any = {
      status: shouldRetry ? 'failed' : 'failed',
      last_error: errorMsg.slice(0, 500),
      tries: newTries,
      updated_at: new Date(),
    };

    if (shouldRetry) {
      updateData.next_retry_at = new Date(Date.now() + RETRY_DELAYS[newTries - 1] * 1000);
    } else {
      // Fallback 补救
      await this.triggerFallback(scheduleId, errorMsg);
    }

    const { error } = await this.supabase
      .from('schedules')
      .update(updateData)
      .eq('id', scheduleId);

    if (error) {
      this.logger.error(`标记任务 ${scheduleId} 失败失败：${error.message}`);
    }
  }

  /**
   * Fallback 补救（最终失败）
   */
  private async triggerFallback(scheduleId: string, errorMsg: string) {
    this.logger.warn(`任务 ${scheduleId} 达到最大重试次数，触发 Fallback`);

    // 示例：通知用户 + 创建备份内容
    const { data: schedule } = await this.supabase
      .from('schedules')
      .select('user_id, content_id, content(title,body)')
      .eq('id', scheduleId)
      .single();

    if (schedule) {
      // 创建备份内容
      await this.supabase.from('content').insert({
        user_id: schedule.user_id,
        title: `[发布失败备份] ${schedule.content.title}`,
        body: `${schedule.content.body}\n\n---\n发布失败原因：${errorMsg}`,
        status: 'draft',
      });

      // 可选：发送邮件/推送通知用户
      console.log(`[Fallback] 已为用户 ${schedule.user_id} 创建失败备份`);
    }
  }
}