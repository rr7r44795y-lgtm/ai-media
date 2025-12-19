/**
 * 定时任务创建DTO
 * 路径：schedule/dto/create-schedule.dto.ts
 * 统一定时任务创建参数格式，支持多任务类型校验，适配所有定时任务场景
 */
import {
  IsString,
  IsEnum,
  IsNotEmpty,
  IsDateString,
  IsJSON,
  ValidateIf,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PlatformType } from '../../platform/dto/connect-platform.dto';

/**
 * 定时任务类型枚举（与schedule-scanner.ts中的taskType对应）
 */
export enum ScheduleTaskType {
  PLATFORM_PUBLISH = 'PLATFORM_PUBLISH', // 社交平台定时发布
  CONTENT_ARCHIVE = 'CONTENT_ARCHIVE',   // 内容自动归档
  TOKEN_REFRESH = 'TOKEN_REFRESH',       // 平台令牌强制刷新
}

/**
 * 定时任务创建请求DTO
 */
export class CreateScheduleDto {
  /**
   * 任务类型（必填）
   */
  @IsEnum(ScheduleTaskType, {
    message: `任务类型必须是：${Object.values(ScheduleTaskType).join(', ')}`,
  })
  @IsNotEmpty({ message: '任务类型不能为空' })
  taskType: ScheduleTaskType;

  /**
   * 任务执行时间（必填，ISO格式时间字符串，如：2025-12-20T08:00:00.000Z）
   */
  @IsDateString({}, { message: '执行时间必须是合法的ISO格式时间字符串' })
  @IsNotEmpty({ message: '执行时间不能为空' })
  executeTime: string;

  /**
   * 任务参数（JSON字符串，必填，不同任务类型参数格式不同）
   */
  @IsJSON({ message: '任务参数必须是合法的JSON字符串' })
  @IsNotEmpty({ message: '任务参数不能为空' })
  @Transform(({ value }) => {
    // 尝试解析JSON，确保格式正确
    try {
      return JSON.parse(value);
    } catch (e) {
      throw new Error('任务参数JSON格式错误');
    }
  })
  params: Record<string, any>;

  /**
   * 任务名称（可选，用于标识任务）
   */
  @IsString()
  @IsOptional()
  @Length(2, 50, { message: '任务名称长度需在2-50字符之间' })
  @Transform(({ value }) => value?.trim()) // 去除首尾空格
  taskName?: string;

  /**
   * 任务描述（可选）
   */
  @IsString()
  @IsOptional()
  @Length(0, 200, { message: '任务描述长度不能超过200字符' })
  description?: string;

  // ------------------------------ 条件校验：PLATFORM_PUBLISH 类型专属 ------------------------------
  /**
   * 平台类型（仅PLATFORM_PUBLISH类型必填）
   */
  @ValidateIf((o) => o.taskType === ScheduleTaskType.PLATFORM_PUBLISH)
  @IsEnum(PlatformType, {
    message: `平台类型必须是：${Object.values(PlatformType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'PLATFORM_PUBLISH类型任务必须指定平台类型' })
  platform?: PlatformType;

  /**
   * 平台账号ID（仅PLATFORM_PUBLISH类型可选）
   */
  @ValidateIf((o) => o.taskType === ScheduleTaskType.PLATFORM_PUBLISH)
  @IsString()
  @IsOptional()
  @Matches(/^[\w-]+$/, { message: '账号ID只能包含字母、数字、下划线、短横线' })
  accountId?: string;

  // ------------------------------ 条件校验：CONTENT_ARCHIVE 类型专属 ------------------------------
  /**
   * 内容ID（仅CONTENT_ARCHIVE类型必填）
   */
  @ValidateIf((o) => o.taskType === ScheduleTaskType.CONTENT_ARCHIVE)
  @IsString()
  @IsNotEmpty({ message: 'CONTENT_ARCHIVE类型任务必须指定内容ID' })
  contentId?: string;

  // ------------------------------ 条件校验：TOKEN_REFRESH 类型专属 ------------------------------
  /**
   * 平台连接ID（仅TOKEN_REFRESH类型必填）
   */
  @ValidateIf((o) => o.taskType === ScheduleTaskType.TOKEN_REFRESH)
  @IsString()
  @IsNotEmpty({ message: 'TOKEN_REFRESH类型任务必须指定平台连接ID' })
  connectId?: string;
}

/**
 * 定时任务创建响应DTO
 */
export class CreateScheduleResponseDto {
  /**
   * 任务ID
   */
  @IsString()
  id: string;

  /**
   * 任务类型
   */
  @IsEnum(ScheduleTaskType)
  taskType: ScheduleTaskType;

  /**
   * 任务名称
   */
  @IsOptional()
  @IsString()
  taskName?: string;

  /**
   * 执行时间（ISO格式）
   */
  @IsDateString()
  executeTime: string;

  /**
   * 任务状态（pending=待执行）
   */
  @IsEnum(['pending', 'running', 'success', 'failed', 'retrying'])
  status: 'pending' | 'running' | 'success' | 'failed' | 'retrying';

  /**
   * 创建时间（ISO格式）
   */
  @IsDateString()
  createdAt: string;

  /**
   * 关联用户ID
   */
  @IsString()
  userId: string;
}

/**
 * 定时任务查询DTO
 */
export class QueryScheduleDto {
  /**
   * 任务类型（可选）
   */
  @IsEnum(ScheduleTaskType)
  @IsOptional()
  taskType?: ScheduleTaskType;

  /**
   * 任务状态（可选）
   */
  @IsEnum(['pending', 'running', 'success', 'failed', 'retrying'])
  @IsOptional()
  status?: string;

  /**
   * 开始时间（可选，筛选执行时间>=该时间的任务）
   */
  @IsDateString()
  @IsOptional()
  startTime?: string;

  /**
   * 结束时间（可选，筛选执行时间<=该时间的任务）
   */
  @IsDateString()
  @IsOptional()
  endTime?: string;

  /**
   * 页码（默认1）
   */
  @Transform(({ value }) => parseInt(value) || 1)
  @IsOptional()
  page?: number = 1;

  /**
   * 每页数量（默认20）
   */
  @Transform(({ value }) => parseInt(value) || 20)
  @IsOptional()
  size?: number = 20;
}

/**
 * 定时任务更新DTO（仅支持更新执行时间/任务名称/描述）
 */
export class UpdateScheduleDto {
  /**
   * 任务ID（必填）
   */
  @IsString()
  @IsNotEmpty({ message: '任务ID不能为空' })
  id: string;

  /**
   * 新的执行时间（可选）
   */
  @IsDateString()
  @IsOptional()
  executeTime?: string;

  /**
   * 新的任务名称（可选）
   */
  @IsString()
  @IsOptional()
  @Length(2, 50, { message: '任务名称长度需在2-50字符之间' })
  taskName?: string;

  /**
   * 新的任务描述（可选）
   */
  @IsString()
  @IsOptional()
  @Length(0, 200, { message: '任务描述长度不能超过200字符' })
  description?: string;
}

/**
 * 定时任务删除DTO
 */
export class DeleteScheduleDto {
  /**
   * 任务ID（必填）
   */
  @IsString()
  @IsNotEmpty({ message: '任务ID不能为空' })
  id: string;

  /**
   * 是否强制删除（可选，默认false；true=即使任务执行中也删除，false=仅删除待执行任务）
   */
  @IsOptional()
  force?: boolean = false;
}