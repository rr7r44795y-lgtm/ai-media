/**
 * 定时任务更新DTO
 * 路径：schedule/dto/update-schedule.dto.ts
 * 专用于定时任务更新场景，支持精细化参数校验、状态约束，适配任务生命周期管理
 */
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsJSON,
  Length,
  ValidateIf,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ScheduleTaskType } from './create-schedule.dto';
import { PlatformType } from '../../platform/dto/connect-platform.dto';

/**
 * 任务可更新状态枚举（仅待执行/重试中的任务可更新）
 */
export enum UpdatableStatus {
  PENDING = 'pending',     // 待执行
  RETRYING = 'retrying',   // 重试中
}

/**
 * 定时任务更新请求DTO
 * 核心设计：仅允许更新非核心参数，且仅允许更新「待执行/重试中」的任务
 */
export class UpdateScheduleDto {
  /**
   * 任务ID（必填，唯一标识）
   */
  @IsString()
  @IsNotEmpty({ message: '任务ID不能为空' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, {
    message: '任务ID必须是合法的UUID格式',
  })
  id: string;

  /**
   * 新的执行时间（可选，ISO格式，如：2025-12-25T10:00:00.000Z）
   */
  @IsDateString({}, { message: '执行时间必须是合法的ISO格式时间字符串' })
  @IsOptional()
  executeTime?: string;

  /**
   * 新的任务名称（可选）
   */
  @IsString()
  @IsOptional()
  @Length(2, 50, { message: '任务名称长度需在2-50字符之间' })
  @Transform(({ value }) => value?.trim()) // 去除首尾空格
  taskName?: string;

  /**
   * 新的任务描述（可选）
   */
  @IsString()
  @IsOptional()
  @Length(0, 200, { message: '任务描述长度不能超过200字符' })
  @Transform(({ value }) => value?.trim())
  description?: string;

  /**
   * 新的任务参数（可选，JSON字符串，仅允许更新待执行/重试中的任务）
   * 注意：任务类型不同，参数格式不同，需与原任务类型匹配
   */
  @ValidateIf((o) => o.params !== undefined)
  @IsJSON({ message: '任务参数必须是合法的JSON字符串' })
  @Transform(({ value }) => {
    try {
      return JSON.parse(value);
    } catch (e) {
      throw new Error('任务参数JSON格式错误');
    }
  })
  params?: Record<string, any>;

  /**
   * 强制更新（可选，默认false；true=忽略任务状态强制更新，仅管理员可用）
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean = false;

  // ------------------------------ 按任务类型的参数校验（仅更新params时生效） ------------------------------
  /**
   * 平台类型（仅PLATFORM_PUBLISH类型更新params时可选）
   */
  @ValidateIf((o) => o.params && o.taskType === ScheduleTaskType.PLATFORM_PUBLISH)
  @IsEnum(PlatformType, {
    message: `平台类型必须是：${Object.values(PlatformType).join(', ')}`,
  })
  @IsOptional()
  platform?: PlatformType;

  /**
   * 内容ID（仅CONTENT_ARCHIVE类型更新params时可选）
   */
  @ValidateIf((o) => o.params && o.taskType === ScheduleTaskType.CONTENT_ARCHIVE)
  @IsString()
  @IsOptional()
  contentId?: string;

  /**
   * 平台连接ID（仅TOKEN_REFRESH类型更新params时可选）
   */
  @ValidateIf((o) => o.params && o.taskType === ScheduleTaskType.TOKEN_REFRESH)
  @IsString()
  @IsOptional()
  connectId?: string;

  // ------------------------------ 内部使用字段（前端无需传参） ------------------------------
  /**
   * 任务类型（内部校验用，前端无需传参）
   */
  @IsEnum(ScheduleTaskType)
  @IsOptional()
  taskType?: ScheduleTaskType;

  /**
   * 当前任务状态（内部校验用，前端无需传参）
   */
  @IsEnum(UpdatableStatus)
  @IsOptional()
  currentStatus?: UpdatableStatus;
}

/**
 * 定时任务更新响应DTO
 */
export class UpdateScheduleResponseDto {
  /**
   * 任务ID
   */
  @IsString()
  id: string;

  /**
   * 更新状态
   */
  @IsEnum(['success', 'failed'])
  status: 'success' | 'failed';

  /**
   * 更新后的执行时间（ISO格式，可选）
   */
  @IsOptional()
  @IsDateString()
  executeTime?: string;

  /**
   * 更新后的任务名称（可选）
   */
  @IsOptional()
  @IsString()
  taskName?: string;

  /**
   * 更新时间（ISO格式）
   */
  @IsDateString()
  updatedAt: string;

  /**
   * 提示信息
   */
  @IsString()
  message: string;
}

/**
 * 定时任务手动触发DTO（紧急执行任务，无需等待执行时间）
 */
export class TriggerScheduleDto {
  /**
   * 任务ID（必填）
   */
  @IsString()
  @IsNotEmpty({ message: '任务ID不能为空' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, {
    message: '任务ID必须是合法的UUID格式',
  })
  id: string;

  /**
   * 执行后是否保留任务（可选，默认false；true=执行后任务状态不变，false=执行后标记为成功）
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  keepTask?: boolean = false;

  /**
   * 强制执行（可选，默认false；true=即使任务已过期/失败也执行）
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean = false;
}

/**
 * 定时任务手动触发响应DTO
 */
export class TriggerScheduleResponseDto {
  /**
   * 任务ID
   */
  @IsString()
  id: string;

  /**
   * 执行状态
   */
  @IsEnum(['success', 'failed'])
  status: 'success' | 'failed';

  /**
   * 执行结果（如发布的内容ID、刷新的令牌信息等）
   */
  @IsOptional()
  @IsJSON()
  result?: Record<string, any>;

  /**
   * 执行时间（ISO格式）
   */
  @IsDateString()
  triggerTime: string;

  /**
   * 提示信息
   */
  @IsString()
  message: string;
}