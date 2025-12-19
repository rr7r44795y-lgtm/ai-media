/**
 * 排程管理控制器
 * 路径：src/modules/schedule/schedule.controller.ts
 * 完全基于 Supabase + RLS
 */
import {
  Controller,
  Post,
  Get,
  Param,
  Delete,
  Query,
  Body,
  HttpStatus,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ScheduleService } from './schedule.service';

interface CalendarQuery {
  start: string; // ISO date
  end: string;   // ISO date
}

@Controller('schedule')
@UseGuards(AuthGuard('jwt'))
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /**
   * 1. 创建新排程
   * POST /schedule
   */
  @Post()
  async createSchedule(
    @Body() dto: {
      contentId: string;
      platform: string;
      scheduledAt: string; // ISO string
    },
    @CurrentUser() user: JwtPayload,
  ) {
    const schedule = await this.scheduleService.createSchedule({
      userId: user.sub,
      contentId: dto.contentId,
      platform: dto.platform,
      scheduledAt: dto.scheduledAt,
    });

    return {
      success: true,
      message: '排程创建成功',
      data: schedule,
    };
  }

  /**
   * 2. 查询当前用户的所有排程（支持筛选）
   * GET /schedule
   */
  @Get()
  async getUserSchedules(
    @Query('status') status?: 'pending' | 'success' | 'failed' | 'cancelled',
    @Query('platform') platform?: string,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('pageSize', new DefaultValuePipe(20)) pageSize: number = 20,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.scheduleService.getUserSchedules(user.sub, {
      status,
      platform,
      page,
      pageSize,
    });

    return {
      success: true,
      data: {
        list: result.list,
        pagination: result.pagination,
      },
    };
  }

  /**
   * 3. 查询单个排程详情（含错误日志）
   * GET /schedule/:id
   */
  @Get(':id')
  async getScheduleDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const schedule = await this.scheduleService.getScheduleById(id, user.sub);

    if (!schedule) {
      throw new NotFoundException('排程不存在');
    }

    return {
      success: true,
      data: schedule,
    };
  }

  /**
   * 4. 取消排程（status → cancelled）
   * DELETE /schedule/:id
   */
  @Delete(':id')
  async cancelSchedule(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const schedule = await this.scheduleService.cancelSchedule(id, user.sub);

    if (!schedule) {
      throw new NotFoundException('排程不存在');
    }

    return {
      success: true,
      message: '排程已取消',
      data: schedule,
    };
  }

  /**
   * 5. 日历视图排程（按时间范围）
   * GET /schedule/calendar?start=2025-12-01&end=2025-12-31
   */
  @Get('calendar')
  async getCalendarSchedules(
    @Query() query: CalendarQuery,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!query.start || !query.end) {
      throw new BadRequestException('start 和 end 参数必填');
    }

    const schedules = await this.scheduleService.getSchedulesByDateRange(
      user.sub,
      query.start,
      query.end,
    );

    return {
      success: true,
      data: schedules,
    };
  }
}