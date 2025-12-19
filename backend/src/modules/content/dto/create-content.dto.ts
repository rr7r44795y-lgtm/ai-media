/**
 * 内容创建DTO
 * 路径：src/modules/content/dto/create-content.dto.ts
 * 用于校验前端创建内容时的入参，适配文章、资讯、动态、多媒体等多类型内容场景
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

/**
 * 内容类型枚举（支持多媒体内容）
 */
export enum ContentType {
  IMAGE = 'image',
  VIDEO = 'video',
  TEXT = 'text',
}

/**
 * 内容状态枚举
 */
export enum ContentStatus {
  DRAFT = 'draft', // 草稿
  PUBLISHED = 'published', // 已发布
  ARCHIVED = 'archived', // 已归档
  RECYCLE = 'recycle', // 回收站
}

/**
 * 标签DTO（嵌套校验）
 */
export class ContentTagDto {
  @IsOptional()
  @IsUUID('4', { message: '标签ID必须为UUID格式' })
  id?: string;

  @IsNotEmpty({ message: '标签名称不能为空' })
  @IsString({ message: '标签名称必须为字符串' })
  @Length(1, 20, { message: '标签名称长度需在1-20位之间' })
  name: string;
}

/**
 * 封面图DTO（嵌套校验）
 */
export class ContentCoverDto {
  @IsNotEmpty({ message: '封面图URL不能为空' })
  @IsString({ message: '封面图URL必须为字符串' })
  @Matches(/^(http|https):\/\/.+/, { message: '封面图URL必须为合法的HTTP/HTTPS链接' })
  url: string;

  @IsOptional()
  @IsString({ message: '封面图备注必须为字符串' })
  @Length(0, 100, { message: '封面图备注长度不能超过100位' })
  alt?: string;

  @IsOptional()
  @IsBoolean({ message: '是否为主封面必须为布尔值' })
  isMain?: boolean = true;
}

/**
 * 创建内容核心DTO（丰富版）
 */
export class CreateContentDto {
  /**
   * 内容标题
   */
  @IsNotEmpty({ message: '内容标题不能为空' })
  @IsString({ message: '内容标题必须为字符串' })
  @Length(1, 200, { message: '内容标题长度需在1-200位之间' })
  title: string;

  /**
   * 内容类型（image/video/text）
   */
  @IsNotEmpty({ message: '内容类型不能为空' })
  @IsEnum(ContentType, {
    message: `内容类型仅支持：${Object.values(ContentType).join(', ')}`,
  })
  type: ContentType;

  /**
   * 内容状态（默认草稿）
   */
  @IsOptional()
  @IsEnum(ContentStatus, {
    message: `内容状态仅支持：${Object.values(ContentStatus).join(', ')}`,
  })
  status?: ContentStatus = ContentStatus.DRAFT;

  /**
   * 内容正文（文本类型必填，其他类型可选）
   */
  @IsOptional()
  @IsString({ message: '内容正文必须为字符串' })
  @Length(1, 50000, { message: '内容正文长度需在1-50000位之间' })
  content?: string;

  /**
   * 内容摘要/简介
   */
  @IsOptional()
  @IsString({ message: '内容摘要必须为字符串' })
  @Length(0, 500, { message: '内容摘要长度不能超过500位' })
  summary?: string;

  /**
   * Supabase Storage 文件路径（上传完成后传入）
   * 格式：content/{user_id}/{uuid}.ext
   */
  @IsOptional()
  @IsString({ message: '文件路径必须为字符串' })
  filePath?: string;

  /**
   * 文件 MIME 类型（用于记录和校验）
   */
  @IsOptional()
  @IsString({ message: '文件类型必须为字符串' })
  fileType?: string;

  /**
   * 封面图（支持单张/多张，嵌套校验）
   */
  @IsOptional()
  @IsArray({ message: '封面图必须为数组格式' })
  @ValidateNested({ each: true })
  @Type(() => ContentCoverDto)
  covers?: ContentCoverDto[];

  /**
   * 标签列表（嵌套校验，支持 ID 或 name 创建）
   */
  @IsOptional()
  @IsArray({ message: '标签必须为数组格式' })
  @ValidateNested({ each: true })
  @Type(() => ContentTagDto)
  tags?: ContentTagDto[];

  /**
   * 分类ID
   */
  @IsOptional()
  @IsUUID('4', { message: '分类ID必须为UUID格式' })
  categoryId?: string;

  /**
   * 是否置顶
   */
  @IsOptional()
  @IsBoolean({ message: '是否置顶必须为布尔值' })
  isTop?: boolean = false;

  /**
   * 是否允许评论
   */
  @IsOptional()
  @IsBoolean({ message: '是否允许评论必须为布尔值' })
  allowComment?: boolean = true;

  /**
   * 阅读权限（0-公开，1-仅自己可见，2-仅粉丝可见，3-指定角色可见）
   */
  @IsOptional()
  @IsEnum([0, 1, 2, 3], { message: '阅读权限仅支持：0(公开)、1(仅自己)、2(仅粉丝)、3(指定角色)' })
  permission?: 0 | 1 | 2 | 3 = 0;

  /**
   * 排序权重（数值越大越靠前）
   */
  @IsOptional()
  @IsNumber({}, { message: '排序权重必须为数字' })
  @Min(0, { message: '排序权重最小值为0' })
  @Max(9999, { message: '排序权重最大值为9999' })
  sort?: number = 0;

  /**
   * 自定义SEO标题
   */
  @IsOptional()
  @IsString({ message: 'SEO标题必须为字符串' })
  @Length(0, 200, { message: 'SEO标题长度不能超过200位' })
  seoTitle?: string;

  /**
   * 自定义SEO关键词
   */
  @IsOptional()
  @IsString({ message: 'SEO关键词必须为字符串' })
  @Length(0, 500, { message: 'SEO关键词长度不能超过500位' })
  seoKeywords?: string;

  /**
   * 自定义SEO描述
   */
  @IsOptional()
  @IsString({ message: 'SEO描述必须为字符串' })
  @Length(0, 1000, { message: 'SEO描述长度不能超过1000位' })
  seoDescription?: string;

  /**
   * 扩展字段（存储自定义数据）
   */
  @IsOptional()
  @IsString({ message: '扩展字段必须为JSON字符串' })
  @Matches(/^\{.*\}$/, { message: '扩展字段必须为合法的JSON字符串' })
  extend?: string;
}

/**
 * 更新内容DTO（继承创建DTO，部分字段可选）
 */
export class UpdateContentDto extends CreateContentDto {
  /**
   * 内容ID（更新时必填）
   */
  @IsNotEmpty({ message: '内容ID不能为空' })
  @IsUUID('4', { message: '内容ID必须为UUID格式' })
  id: string;

  /**
   * 重写必填字段为可选（更新时可部分修改）
   */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @IsOptional()
  @IsString()
  @Length(1, 50000)
  content?: string;

  // 其他字段已继承 @IsOptional()
}