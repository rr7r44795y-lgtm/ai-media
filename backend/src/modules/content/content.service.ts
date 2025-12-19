/**
 * 内容核心业务服务
 * 路径：src/modules/content/content.service.ts
 * 完全基于 Supabase Client + Storage + RLS
 * 完美适配你的丰富版 CreateContentDto / UpdateContentDto
 */
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupabaseConfig } from 'src/config/supabase.config';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { Database } from '../database/database.type';
import { v4 as uuidv4 } from 'uuid';

type ContentRow = Database['public']['Tables']['content']['Row'];
type ContentInsert = Database['public']['Tables']['content']['Insert'];
type ContentUpdate = Database['public']['Tables']['content']['Update'];
type TagRow = Database['public']['Tables']['tags']['Row'];
type TagInsert = Database['public']['Tables']['tags']['Insert'];
type ContentTagInsert = Database['public']['Tables']['content_tags']['Insert'];

const ALLOWED_FILE_TYPES = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'txt'];
const SIGNED_URL_EXPIRES = 3600; // 1小时

@Injectable()
export class ContentService {
  private readonly supabase;
  private readonly storageBucket = 'content'; // Supabase Storage bucket 名称

  constructor(private readonly supabaseConfig: SupabaseConfig) {
    this.supabase = this.supabaseConfig.getClient();
  }

  /**
   * 1. 生成签名上传 URL（用于前端直传 Storage）
   * 路径：content/{user_id}/{uuid}.ext
   */
  async generateSignedUploadUrl(userId: string, filename: string, filetype: string) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !ALLOWED_FILE_TYPES.includes(ext)) {
      throw new BadRequestException(`不支持的文件类型，仅允许：${ALLOWED_FILE_TYPES.join(', ')}`);
    }

    const fileId = uuidv4();
    const filePath = `${userId}/${fileId}.${ext}`;

    const { data, error } = await this.supabase.storage
      .from(this.storageBucket)
      .createSignedUploadUrl(filePath, {
        upsert: false,
        expiresIn: SIGNED_URL_EXPIRES,
      });

    if (error) throw new BadRequestException('生成上传链接失败');

    return { signedUrl: data.signedUrl, filePath };
  }

  /**
   * 2. 创建内容（支持所有丰富字段 + 标签 + 封面）
   */
  async createContent(dto: CreateContentDto, userId: string) {
    // 处理标签（支持 id 或 name）
    const tagIds = await this.resolveTagIds(dto.tags || [], userId);

    // 处理封面图（存储为 JSON 数组）
    const covers = dto.covers?.map(cover => ({
      id: uuidv4(),
      url: cover.url,
      alt: cover.alt || '',
      isMain: cover.isMain ?? false,
    })) || [];

    // 写入 content 表
    const { data: content, error } = await this.supabase
      .from('content')
      .insert({
        user_id: userId,
        title: dto.title,
        type: dto.type,
        status: dto.status || 'draft',
        content: dto.content,
        summary: dto.summary,
        file_path: dto.filePath,
        file_type: dto.fileType,
        covers,
        category_id: dto.categoryId,
        is_top: dto.isTop || false,
        allow_comment: dto.allowComment ?? true,
        permission: dto.permission || 0,
        sort: dto.sort || 0,
        seo_title: dto.seoTitle,
        seo_keywords: dto.seoKeywords,
        seo_description: dto.seoDescription,
        extend: dto.extend ? JSON.parse(dto.extend) : {},
      })
      .select()
      .single();

    if (error) throw new BadRequestException(`创建失败：${error.message}`);

    // 关联标签
    if (tagIds.length > 0) {
      const links = tagIds.map(tagId => ({
        content_id: content.id,
        tag_id: tagId,
      }));

      const { error: linkError } = await this.supabase
        .from('content_tags')
        .insert(links);

      if (linkError) throw new BadRequestException('关联标签失败');
    }

    return content;
  }

  /**
   * 3. 更新内容（支持部分字段更新 + 标签增删 + 封面增删改）
   */
  async updateContent(dto: UpdateContentDto, userId: string) {
    // 校验内容归属
    const { data: existing, error: findError } = await this.supabase
      .from('content')
      .select('id')
      .eq('id', dto.id)
      .eq('user_id', userId)
      .single();

    if (findError || !existing) throw new ForbiddenException('内容不存在或无权限');

    // 处理标签（如果传了 tags，则完全替换）
    if (dto.tags !== undefined) {
      // 先删除旧关联
      await this.supabase
        .from('content_tags')
        .delete()
        .eq('content_id', dto.id);

      // 再添加新关联
      if (dto.tags.length > 0) {
        const tagIds = await this.resolveTagIds(dto.tags, userId);
        const links = tagIds.map(tagId => ({
          content_id: dto.id,
          tag_id: tagId,
        }));
        await this.supabase.from('content_tags').insert(links);
      }
    }

    // 处理封面图（如果传了，则完全替换）
    let covers = undefined;
    if (dto.covers !== undefined) {
      covers = dto.covers.map(cover => ({
        id: cover.id || uuidv4(),
        url: cover.url,
        alt: cover.alt || '',
        isMain: cover.isMain ?? false,
      }));
    }

    // 处理扩展字段
    let extend = undefined;
    if (dto.extend !== undefined) {
      extend = dto.extend ? JSON.parse(dto.extend) : {};
    }

    // 更新内容
    const updateData: any = {
      updated_at: new Date(),
    };

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.summary !== undefined) updateData.summary = dto.summary;
    if (dto.filePath !== undefined) updateData.file_path = dto.filePath;
    if (dto.fileType !== undefined) updateData.file_type = dto.fileType;
    if (covers !== undefined) updateData.covers = covers;
    if (dto.categoryId !== undefined) updateData.category_id = dto.categoryId;
    if (dto.isTop !== undefined) updateData.is_top = dto.isTop;
    if (dto.allowComment !== undefined) updateData.allow_comment = dto.allowComment;
    if (dto.permission !== undefined) updateData.permission = dto.permission;
    if (dto.sort !== undefined) updateData.sort = dto.sort;
    if (dto.seoTitle !== undefined) updateData.seo_title = dto.seoTitle;
    if (dto.seoKeywords !== undefined) updateData.seo_keywords = dto.seoKeywords;
    if (dto.seoDescription !== undefined) updateData.seo_description = dto.seoDescription;
    if (extend !== undefined) updateData.extend = extend;

    const { data, error } = await this.supabase
      .from('content')
      .update(updateData)
      .eq('id', dto.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new BadRequestException(`更新失败：${error.message}`);

    return data;
  }

  /**
   * 4. 查询用户内容列表（支持标签筛选 + 分页）
   */
  async getUserContents(
    userId: string,
    query: { tagId?: string; page?: number; pageSize?: number },
  ) {
    let qb = this.supabase
      .from('content')
      .select('*, content_tags(tag_id, tags(name))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (query.tagId) {
      qb = qb.eq('content_tags.tag_id', query.tagId);
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 10;
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
   * 5. 查询单个内容详情
   */
  async getContentById(id: string, userId: string) {
    const { data, error } = await this.supabase
      .from('content')
      .select('*, content_tags(tag_id, tags(name))')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('内容不存在或无权限');

    return data;
  }

  /**
   * 6. 删除内容 + Storage 文件
   */
  async deleteContent(id: string, userId: string) {
    // 查询内容 + 文件路径
    const { data: content, error: findError } = await this.supabase
      .from('content')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !content) throw new ForbiddenException('内容不存在或无权限');

    // 删除数据库记录（会级联删除 content_tags）
    const { error: deleteError } = await this.supabase
      .from('content')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) throw new BadRequestException('删除失败');

    // 删除 Storage 文件（如果有）
    if (content.file_path) {
      await this.supabase.storage
        .from(this.storageBucket)
        .remove([content.file_path]);
    }
  }

  /**
   * 内部工具：解析标签（支持 id 或 name，自动创建新标签）
   */
  private async resolveTagIds(tags: { id?: string; name: string }[], userId: string): Promise<string[]> {
    const tagIds: string[] = [];

    for (const tag of tags) {
      if (tag.id) {
        tagIds.push(tag.id);
        continue;
      }

      // 根据 name 查找或创建
      let { data: existingTag } = await this.supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('name', tag.name)
        .single();

      if (!existingTag) {
        const { data: newTag } = await this.supabase
          .from('tags')
          .insert({ user_id: userId, name: tag.name })
          .select()
          .single();

        existingTag = newTag;
      }

      tagIds.push(existingTag.id);
    }

    return tagIds;
  }
}