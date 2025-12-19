/**
 * 内容更新DTO
 * 路径：content/dto/update-content.dto.ts
 * 适配内容编辑/状态修改/字段更新等场景，支持部分字段更新
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  Length,
  Matches,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

// 复用创建DTO中的枚举（避免重复定义）
import { ContentType, ContentStatus } from './create-content.dto';

/**
 * 标签更新DTO（嵌套校验）
 */
export class UpdateContentTagDto {
  @IsOptional()
  @IsUUID('4', { message: '标签ID必须为UUID格式' })
  id?: string;

  @IsOptional()
  @IsString({ message: '标签名称必须为字符串' })
  @Length(1, 20, { message: '标签名称长度需在1-20位之间' })
  name?: string;
}

/**
 * 封面图更新DTO（嵌套校验）
 */
export class UpdateContentCoverDto {
  @IsOptional()
  @IsUUID('4', { message: '封面图ID必须为UUID格式' })
  id?: string;

  @IsOptional()
  @IsString({ message: '封面图URL必须为字符串' })
  @Matches(/^(http|https):\/\/.+/, { message: '封面图URL必须为合法的HTTP/HTTPS链接' })
  url?: string;

  @IsOptional()
  @IsString({ message: '封面图备注必须为字符串' })
  @Length(0, 100, { message: '封面图备注长度不能超过100位' })
  alt?: string;

  @IsOptional()
  @IsBoolean({ message: '是否为主封面必须为布尔值' })
  isMain?: boolean;
}

/**
 * 内容更新核心DTO（支持部分字段更新）
 */
export class UpdateContentDto {
  /**
   * 内容ID（更新时必填，路径参数/请求体均可，此处做双重校验）
   */
  @IsNotEmpty({ message: '内容ID不能为空' })
  @IsUUID('4', { message: '内容ID必须为UUID格式' })
  id: string;

  /**
   * 内容标题（可选更新）
   */
  @IsOptional()
  @IsString({ message: '内容标题必须为字符串' })
  @Length(1, 200, { message: '内容标题长度需在1-200位之间' })
  title?: string;

  /**
   * 内容类型（可选更新，不建议频繁修改）
   */
  @IsOptional()
  @IsEnum(ContentType, {
    message: `内容类型仅支持：${Object.values(ContentType).join(', ')}`,
  })
  type?: ContentType;

  /**
   * 内容状态（单独更新状态时常用）
   */
  @IsOptional()
  @IsEnum(ContentStatus, {
    message: `内容状态仅支持：${Object.values(ContentStatus).join(', ')}`,
  })
  status?: ContentStatus;

  /**
   * 内容正文（可选更新）
   */
  @IsOptional()
  @IsString({ message: '内容正文必须为字符串' })
  @Length(1, 50000, { message: '内容正文长度需在1-50000位之间' })
  content?: string;

  /**
   * 内容摘要/简介（可选更新）
   */
  @IsOptional()
  @IsString({ message: '内容摘要必须为字符串' })
  @Length(0, 500, { message: '内容摘要长度不能超过500位' })
  summary?: string;

  /**
   * 封面图（可选更新，支持增删改）
   */
  @IsOptional()
  @IsArray({ message: '封面图必须为数组格式' })
  @ValidateNested({ each: true })
  @Type(() => UpdateContentCoverDto)
  covers?: UpdateContentCoverDto[];

  /**
   * 标签列表（可选更新）
   */
  @IsOptional()
  @IsArray({ message: '标签必须为数组格式' })
  @ValidateNested({ each: true })
  @Type(() => UpdateContentTagDto)
  tags?: UpdateContentTagDto[];

  /**
   * 分类ID（可选更新）
   */
  @IsOptional()
  @IsUUID('4', { message: '分类ID必须为UUID格式' })
  categoryId?: string;

  /**
   * 是否置顶（可选更新）
   */
  @IsOptional()
  @IsBoolean({ message: '是否置顶必须为布尔值' })
  isTop?: boolean;

  /**
   * 是否允许评论（可选更新）
   */
  @IsOptional()
  @IsBoolean({ message: '是否允许评论必须为布尔值' })
  allowComment?: boolean;

  /**
   * 阅读权限（可选更新）
   */
  @IsOptional()
  @IsEnum([0, 1, 2, 3], { message: '阅读权限仅支持：0(公开)、1(仅自己)、2(仅粉丝)、3(指定角色)' })
  permission?: 0 | 1 | 2 | 3;

  /**
   * 排序权重（可选更新）
   */
  @IsOptional()
  @IsNumber({}, { message: '排序权重必须为数字' })
  @Min(0, { message: '排序权重最小值为0' })
  @Max(9999, { message: '排序权重最大值为9999' })
  sort?: number;

  /**
   * 自定义SEO标题（可选更新）
   */
  @IsOptional()
  @IsString({ message: 'SEO标题必须为字符串' })
  @Length(0, 200, { message: 'SEO标题长度不能超过200位' })
  seoTitle?: string;

  /**
   * 自定义SEO关键词（可选更新）
   */
  @IsOptional()
  @IsString({ message: 'SEO关键词必须为字符串' })
  @Length(0, 500, { message: 'SEO关键词长度不能超过500位' })
  seoKeywords?: string;

  /**
   * 自定义SEO描述（可选更新）
   */
  @IsOptional()
  @IsString({ message: 'SEO描述必须为字符串' })
  @Length(0, 1000, { message: 'SEO描述长度不能超过1000位' })
  seoDescription?: string;

  /**
   * 扩展字段（可选更新）
   */
  @IsOptional()
  @IsString({ message: '扩展字段必须为JSON字符串' })
  @Matches(/^\{.*\}$/, { message: '扩展字段必须为合法的JSON字符串' })
  extend?: string;

  /**
   * 更新人ID（可选，由后端自动填充也可前端传）
   */
  @IsOptional()
  @IsUUID('4', { message: '更新人ID必须为UUID格式' })
  updateBy?: string;
}

/**
 * 仅更新内容状态的简化DTO（高频操作专用）
 */
export class UpdateContentStatusDto {
  @IsNotEmpty({ message: '内容ID不能为空' })
  @IsUUID('4', { message: '内容ID必须为UUID格式' })
  id: string;

  @IsNotEmpty({ message: '内容状态不能为空' })
  @IsEnum(ContentStatus, {
    message: `内容状态仅支持：${Object.values(ContentStatus).join(', ')}`,
  })
  status: ContentStatus;

  @IsOptional()
  @IsString({ message: '状态修改原因必须为字符串' })
  @Length(0, 500, { message: '状态修改原因长度不能超过500位' })
  reason?: string;
}