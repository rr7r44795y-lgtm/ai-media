/**
 * 内容管理控制器
 * 路径：src/modules/content/content.controller.ts
 * 完全适配丰富版 DTO + Supabase Storage + RLS
 */
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  Patch,
  Query,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContentService } from './content.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Controller('content')
@UseGuards(AuthGuard('jwt'))
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  /**
   * 1. 生成 Supabase Storage 签名上传 URL
   * POST /content/upload-url
   */
  @Post('upload-url')
  async generateUploadUrl(
    @Body('filename') filename: string,
    @Body('filetype') filetype: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!filename || !filetype) {
      throw new BadRequestException('filename 和 filetype 必填');
    }

    const { signedUrl, filePath } = await this.contentService.generateSignedUploadUrl(
      user.sub,
      filename,
      filetype,
    );

    return {
      success: true,
      data: { uploadUrl: signedUrl, filePath },
      message: '签名 URL 生成成功，有效期 1 小时',
    };
  }

  /**
   * 2. 上传完成后写入 content 表（支持丰富字段）
   * POST /content
   */
  @Post()
  async createContent(
    @Body() dto: CreateContentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // 自动填充 userId
    const content = await this.contentService.createContent(dto, user.sub);

    return {
      success: true,
      message: '内容创建成功',
      data: content,
    };
  }

  /**
   * 3. 查询当前用户的所有内容（支持标签筛选 + 分页）
   * GET /content
   */
  @Get()
  async getUserContents(
    @Query('tagId') tagId?: string,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('pageSize', new DefaultValuePipe(10)) pageSize: number = 10,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.contentService.getUserContents(user.sub, {
      tagId,
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
   * 4. 查询单个内容详情
   * GET /content/:id
   */
  @Get(':id')
  async getContentDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const content = await this.contentService.getContentById(id, user.sub);

    return {
      success: true,
      data: content,
    };
  }

  /**
   * 5. 更新内容（支持部分字段更新）
   * PATCH /content
   */
  @Patch()
  async updateContent(
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const content = await this.contentService.updateContent(dto, user.sub);

    return {
      success: true,
      message: '内容更新成功',
      data: content,
    };
  }

  /**
   * 6. 删除内容（同时删除 Storage 文件）
   * DELETE /content/:id
   */
  @Delete(':id')
  async deleteContent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.contentService.deleteContent(id, user.sub);

    return {
      success: true,
      message: '内容及关联文件已删除',
    };
  }

  /**
   * 7. 为内容添加标签（支持 tag id 或 name）
   * POST /content/:id/tags
   */
  @Post(':id/tags')
  async addTagsToContent(
    @Param('id', ParseUUIDPipe) contentId: string,
    @Body() body: { tags: { id?: string; name: string }[] },
    @CurrentUser() user: JwtPayload,
  ) {
    if (!Array.isArray(body.tags) || body.tags.length === 0) {
      throw new BadRequestException('tags 必须为非空数组');
    }

    await this.contentService.addTagsToContent(contentId, body.tags, user.sub);

    return {
      success: true,
      message: '标签添加成功',
    };
  }

  /**
   * 8. 移除内容标签
   * DELETE /content/:id/tags/:tagId
   */
  @Delete(':id/tags/:tagId')
  async removeTagFromContent(
    @Param('id', ParseUUIDPipe) contentId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.contentService.removeTagFromContent(contentId, tagId, user.sub);

    return {
      success: true,
      message: '标签移除成功',
    };
  }
}