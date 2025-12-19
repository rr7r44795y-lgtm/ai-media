/**
 * 定时任务管理控制器
 * 路径：cron/cron.controller.ts
 * 对外暴露定时任务手动触发/状态查看API
 */
import { Controller, Get, Post, Body, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // 复用鉴权守卫
import { CronService } from './cron.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator'; // 复用全局用户装饰器
import { JwtPayload } from '../auth/strategies/jwt.strategy'; // 复用JWT类型

@Controller('cron')
@UseGuards(AuthGuard('jwt')) // 仅登录用户可访问
export class CronController {
  constructor(private readonly cronService: CronService) {}

  /**
   * 手动触发定时任务
   * POST /cron/trigger
   * @param body { taskName: string }
   * @param user 当前登录用户（仅管理员可操作）
   */
  @Post('trigger')
  async triggerTask(
    @Body('taskName') taskName: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      // 仅管理员可手动触发定时任务
      const isAdmin = user.roles?.includes('admin');
      if (!isAdmin) {
        throw new HttpException('仅管理员可触发定时任务', HttpStatus.FORBIDDEN);
      }

      await this.cronService.triggerTask(taskName);
      return {
        success: true,
        message: `定时任务【${taskName}】触发成功`,
      };
    } catch (error) {
      throw new HttpException(
        `触发定时任务失败：${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 查看所有定时任务状态
   * GET /cron/status
   * @param user 当前登录用户
   */
  @Get('status')
  async getTaskStatus(@CurrentUser() user: JwtPayload) {
    try {
      // 仅管理员可查看
      const isAdmin = user.roles?.includes('admin');
      if (!isAdmin) {
        throw new HttpException('仅管理员可查看定时任务状态', HttpStatus.FORBIDDEN);
      }

      // 模拟返回任务状态（可扩展为读取实际任务运行状态）
      return {
        success: true,
        data: [
          { taskName: 'cleanExpiredContent', cron: '0 1 * * *', status: 'running' },
          { taskName: 'updateContentViewCount', cron: '0 * * * *', status: 'running' },
          { taskName: 'checkContentPublishStatus', interval: '5m', status: 'running' },
        ],
      };
    } catch (error) {
      throw new HttpException(
        `查看定时任务状态失败：${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}