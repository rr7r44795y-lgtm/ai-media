/**
 * 排程核心业务服务
 * 路径：src/modules/schedule/schedule.service.ts
 * 完全基于 Supabase + RLS + 定时扫描
 */
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseConfig } from 'src/config/supabase.config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlatformService } from '../platform/platform.service'; // 假设有平台发布服务
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/database.type';

type ScheduleRow = Database['public']['Tables']['schedules']['Row'];
type ScheduleInsert = Database['public']['Tables']['schedules']['Insert'];
type ScheduleUpdate = Database['public']['Tables']['schedules']['Update'];
const PLATFORM_TEXT_LIMITS = {
  facebook: 20000,
  instagram: 2200,
  linkedin: 3000,
  youtube: 5000, // 标题+描述
};

const MAX_TRIES = 4;
const RETRY_DELAYS = [60, 300, 900, 3600]; // 秒：1min, 5min, 15min, 1h

@Injectable()
export class ScheduleService {
  private readonly supabase;

  constructor(
    private readonly supabaseConfig: SupabaseConfig,
    private readonly platformService: PlatformService,
  ) {
    this.supabase = this.supabaseConfig.getClient();
  }

  /**
   * 1. 创建排程（多平台支持）
   */
  async createSchedule(
    userId: string,
    dto: {
      contentId: string;
      platforms: string[]; // ['facebook', 'instagram']
      scheduledAt: string; // ISO string
    },
  ) {
    // 校验内容归属
    const { data: content, error: contentError } = await this.supabase
      .from('content')
      .select('id, title, body, file_path, file_type')
      .eq('id', dto.contentId)
      .eq('user_id', userId)
      .single();

    if (contentError || !content) {
      throw new NotFoundException('内容不存在或无权限');
    }

    // 校验时间（>= 当前时间 + 60秒）
    const scheduledTime = new Date(dto.scheduledAt);
    const minTime = new Date(Date.now() + 60 * 1000);
    if (scheduledTime < minTime) {
      throw new BadRequestException('排程时间必须至少晚于当前时间60秒');
    }

    // 校验平台文本长度
    const text = `${content.title || ''}\n${content.body || ''}`.trim();
    for (const platform of dto.platforms) {
      if (text.length > PLATFORM_TEXT_LIMITS[platform]) {
        throw new BadRequestException(`${platform} 文本长度超过限制(${PLATFORM_TEXT_LIMITS[platform]}字符)`);
      }

      // 校验平台已授权（假设 PlatformService 有方法）
      const authorized = await this.platformService.isPlatformAuthorized(userId, platform);
      if (!authorized) {
        throw new BadRequestException(`${platform} 平台未授权`);
      }
    }

    // 为每个平台创建一条排程记录
    const schedules = dto.platforms.map(platform => ({
      id: uuidv4(),
      user_id: userId,
      content_id: dto.contentId,
      platform,
      scheduled_at: scheduledTime,
      status: 'pending',
      tries: 0,
    }));

    const { data, error } = await this.supabase
      .from('schedules')
      .insert(schedules)
      .select();

    if (error) throw new BadRequestException('创建排程失败');

    return data;
  }

  /**
   * 2. 查询用户排程列表
   */
  async getUserSchedules(
    userId: string,
    query: { status?: string; platform?: string; page?: number; pageSize?: number },
  ) {
    let qb = this.supabase
      .from('schedules')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('scheduled_at', { ascending: true });

    if (query.status) qb = qb.eq('status', query.status);
    if (query.platform) qb = qb.eq('platform', query.platform);

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    qb = qb.range(offset, offset + pageSize - 1);

    const { data, error, count } = await qb;

    if (error) throw new BadRequestException(error.message);

    return {
      list: data || [],
      pagination: {
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    };
  }

  /**
   * 3. 查询单个排程详情
   */
  async getScheduleById(id: string, userId: string) {
    const { data, error } = await this.supabase
      .from('schedules')
      .select('*, content(*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('排程不存在');

    return data;
  }

  /**
   * 4. 取消排程
   */
  async cancelSchedule(id: string, userId: string) {
    const { data, error } = await this.supabase
      .from('schedules')
      .update({ status: 'cancelled', updated_at: new Date() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('排程不存在或无权限');

    return data;
  }

  /**
   * 5. 日历视图（按时间范围）
   */
  async getCalendarSchedules(userId: string, start: string, end: string) {
    const { data, error } = await this.supabase
      .from('schedules')
      .select('id, platform, scheduled_at, status, content(title)')
      .eq('user_id', userId)
      .gte('scheduled_at', start)
      .lte('scheduled_at', end)
      .order('scheduled_at');

    if (error) throw new BadRequestException(error.message);

    return data || [];
  }

  /**
   * 6. 定时扫描器（每分钟执行）
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanAndExecute() {
    const now = new Date().toISOString();

    // 查询待执行 + 需要重试的任务
    const { data: tasks, error } = await this.supabase
      .from('schedules')
      .select('*, content(*)')
      .in('status', ['pending', 'failed'])
      .lte('scheduled_at', now)
      .lt('tries', MAX_TRIES);

    if (error || !tasks || tasks.length === 0) return;

    for (const task of tasks) {
      try {
        // 调用平台发布
        const result = await this.platformService.publishToPlatform(
          task.platform,
          task.content,
          task.user_id,
        );

        // 成功
        await this.supabase
          .from('schedules')
          .update({
            status: 'success',
            published_url: result.url,
            updated_at: new Date(),
          })
          .eq('id', task.id);

      } catch (err) {
        const newTries = task.tries + 1;
        const shouldRetry = newTries < MAX_TRIES;

        const updateData: any = {
          tries: newTries,
          last_error: err.message?.slice(0, 500),
          updated_at: new Date(),
        };

        if (shouldRetry) {
          updateData.status = 'failed';
          updateData.next_retry_at = new Date(Date.now() + RETRY_DELAYS[newTries - 1] * 1000);
        } else {
          updateData.status = 'failed';
          // Fallback：发送邮件通知 + 创建备份内容
          await this.triggerFallback(task, err.message);
        }

        await this.supabase
          .from('schedules')
          .update(updateData)
          .eq('id', task.id);
      }
    }
  }

  /**
   * 7. Fallback 补救（tries >= 4）
   */
  private async triggerFallback(task: any, errorMsg: string) {
    // 示例：发送邮件通知用户
    console.log(`[Fallback] 用户 ${task.user_id} 的排程 ${task.id} 失败：${errorMsg}`);

    // 可选：创建备份内容（status = draft，备注失败原因）
    await this.supabase.from('content').insert({
      user_id: task.user_id,
      title: `[失败备份] ${task.content.title}`,
      body: task.content.body + `\n\n---\n发布失败原因：${errorMsg}`,
      file_path: task.content.file_path,
      file_type: task.content.file_type,
      status: 'draft',
    });
  }
}