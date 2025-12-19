/**
 * 社交平台控制器
 * 路径：platform/platform.controller.ts
 * 统一暴露社交平台授权、发布、账号管理等API，支持JWT鉴权、参数校验、统一响应格式
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // 复用鉴权守卫
import { CurrentUser } from 'src/common/decorators/current-user.decorator'; // 全局用户装饰器
import { JwtPayload } from '../auth/strategies/jwt.strategy'; // 复用JWT类型
import { PlatformService } from './platform.service';
import {
  ConnectPlatformDto,
  ConnectPlatformResponseDto,
  RefreshPlatformTokenDto,
  RevokePlatformTokenDto,
  PlatformType,
} from './dto/connect-platform.dto';
import {
  FacebookPostParams,
  InstagramPostParams,
  YoutubeVideoUploadParams,
  LinkedinPostParams,
} from './adapters'; // 导入各平台发布参数类型

/**
 * 统一响应格式
 */
type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: number;
};

/**
 * 内容发布通用参数（适配所有平台）
 */
class PublishContentDto {
  @IsEnum(PlatformType)
  platform: PlatformType;

  @IsString()
  @IsOptional()
  accountId?: string; // 可选：指定发布的平台账号ID

  @IsObject()
  postParams:
    | FacebookPostParams
    | InstagramPostParams
    | YoutubeVideoUploadParams
    | LinkedinPostParams;
}

@Controller('platform')
@UseGuards(AuthGuard('jwt')) // 所有接口需登录
@UsePipes(new ValidationPipe({ transform: true, whitelist: true })) // 参数校验
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  // ------------------------------ 授权管理 ------------------------------
  /**
   * 获取平台授权URL（前端跳转授权使用）
   * GET /platform/auth-url
   * @param platform 平台类型
   * @param state 防CSRF状态值
   * @param scope 授权范围
   * @returns 授权URL
   */
  @Get('auth-url')
  async getAuthUrl(
    @Query('platform') @IsEnum(PlatformType) platform: PlatformType,
    @Query('state') @IsString() state: string,
    @Query('scope') @IsOptional() @IsString() scope?: string,
  ): Promise<ApiResponse<{ authUrl: string }>> {
    try {
      const authUrl = await this.platformService.getAuthUrl(platform, state, scope);
      return {
        success: true,
        data: { authUrl },
        message: '获取授权URL成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `获取授权URL失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  /**
   * 连接社交平台（授权码换令牌）
   * POST /platform/connect
   * @param dto 连接参数
   * @param user 当前登录用户
   * @returns 连接结果
   */
  @Post('connect')
  @HttpCode(HttpStatus.CREATED)
  async connectPlatform(
    @Body() dto: ConnectPlatformDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<ConnectPlatformResponseDto>> {
    try {
      const result = await this.platformService.connectPlatform(dto, user.sub); // user.sub为系统用户ID
      return {
        success: true,
        data: result,
        message: '平台连接成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `平台连接失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  /**
   * 刷新平台令牌
   * POST /platform/refresh-token
   * @param dto 刷新参数
   * @param user 当前登录用户
   * @returns 刷新结果
   */
  @Post('refresh-token')
  async refreshPlatformToken(
    @Body() dto: RefreshPlatformTokenDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<ConnectPlatformResponseDto>> {
    try {
      const result = await this.platformService.refreshPlatformToken(dto, user.sub);
      return {
        success: true,
        data: result,
        message: '令牌刷新成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `令牌刷新失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  /**
   * 撤销平台授权（解除绑定）
   * POST /platform/revoke-token
   * @param dto 撤销参数
   * @param user 当前登录用户
   * @returns 撤销结果
   */
  @Post('revoke-token')
  async revokePlatformToken(
    @Body() dto: RevokePlatformTokenDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      await this.platformService.revokePlatformToken(dto, user.sub);
      return {
        success: true,
        data: { success: true },
        message: '平台授权已撤销',
      };
    } catch (error) {
      return {
        success: false,
        message: `撤销授权失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  // ------------------------------ 账号管理 ------------------------------
  /**
   * 获取当前用户绑定的所有社交账号
   * GET /platform/accounts
   * @param user 当前登录用户
   * @param platform 可选：筛选指定平台
   * @returns 账号列表
   */
  @Get('accounts')
  async getUserSocialAccounts(
    @CurrentUser() user: JwtPayload,
    @Query('platform') @IsOptional() @IsEnum(PlatformType) platform?: PlatformType,
  ): Promise<ApiResponse<ConnectPlatformResponseDto[]>> {
    try {
      const accounts = await this.platformService.getUserSocialAccounts(user.sub, platform);
      return {
        success: true,
        data: accounts,
        message: '获取账号列表成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `获取账号列表失败：${error.message}`,
        code: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  /**
   * 获取指定社交账号详情
   * GET /platform/accounts/:connectId
   * @param connectId 连接ID
   * @param user 当前登录用户
   * @returns 账号详情
   */
  @Get('accounts/:connectId')
  async getSocialAccountDetail(
    @Param('connectId') @IsString() connectId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<ConnectPlatformResponseDto>> {
    try {
      const account = await this.platformService.getSocialAccountDetail(connectId, user.sub);
      if (!account) {
        return {
          success: false,
          message: '账号不存在或无访问权限',
          code: HttpStatus.NOT_FOUND,
        };
      }
      return {
        success: true,
        data: account,
        message: '获取账号详情成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `获取账号详情失败：${error.message}`,
        code: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  /**
   * 更新社交账号自定义昵称
   * POST /platform/accounts/:connectId/nickname
   * @param connectId 连接ID
   * @param nickname 新昵称
   * @param user 当前登录用户
   * @returns 更新结果
   */
  @Post('accounts/:connectId/nickname')
  async updateAccountNickname(
    @Param('connectId') @IsString() connectId: string,
    @Body('nickname') @IsString() @Length(2, 50) nickname: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      await this.platformService.updateAccountNickname(connectId, nickname, user.sub);
      return {
        success: true,
        data: { success: true },
        message: '昵称更新成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `昵称更新失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  /**
   * 禁用/启用社交账号
   * POST /platform/accounts/:connectId/status
   * @param connectId 连接ID
   * @param status 目标状态
   * @param user 当前登录用户
   * @returns 更新结果
   */
  @Post('accounts/:connectId/status')
  async updateAccountStatus(
    @Param('connectId') @IsString() connectId: string,
    @Body('status') @IsEnum(['active', 'disabled']) status: 'active' | 'disabled',
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      await this.platformService.updateAccountStatus(connectId, status, user.sub);
      return {
        success: true,
        data: { success: true },
        message: `账号已${status === 'active' ? '启用' : '禁用'}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `更新账号状态失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  // ------------------------------ 内容发布 ------------------------------
  /**
   * 发布内容到指定社交平台
   * POST /platform/publish
   * @param dto 发布参数
   * @param user 当前登录用户
   * @returns 发布结果
   */
  @Post('publish')
  async publishContent(
    @Body() dto: PublishContentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ postId: string; platform: PlatformType }>> {
    try {
      const result = await this.platformService.publishContent(dto, user.sub);
      return {
        success: true,
        data: result,
        message: `内容发布到${dto.platform}成功`,
      };
    } catch (error) {
      return {
        success: false,
        message: `发布内容失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }

  /**
   * 获取平台已发布的内容列表
   * GET /platform/published
   * @param platform 平台类型
   * @param accountId 账号ID
   * @param page 页码
   * @param size 每页数量
   * @param user 当前登录用户
   * @returns 内容列表
   */
  @Get('published')
  async getPublishedContent(
    @Query('platform') @IsEnum(PlatformType) platform: PlatformType,
    @Query('accountId') @IsOptional() @IsString() accountId?: string,
    @Query('page') @IsOptional() @IsNumber() page: number = 1,
    @Query('size') @IsOptional() @IsNumber() size: number = 20,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ list: any[]; total: number; page: number; size: number }>> {
    try {
      const result = await this.platformService.getPublishedContent(
        platform,
        accountId,
        page,
        size,
        user.sub,
      );
      return {
        success: true,
        data: result,
        message: '获取已发布内容成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `获取已发布内容失败：${error.message}`,
        code: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  }

  /**
   * 删除平台已发布的内容
   * DELETE /platform/published/:platform/:postId
   * @param platform 平台类型
   * @param postId 内容ID
   * @param accountId 账号ID
   * @param user 当前登录用户
   * @returns 删除结果
   */
  @Delete('published/:platform/:postId')
  async deletePublishedContent(
    @Param('platform') @IsEnum(PlatformType) platform: PlatformType,
    @Param('postId') @IsString() postId: string,
    @Query('accountId') @IsOptional() @IsString() accountId?: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ success: boolean }>> {
    try {
      await this.platformService.deletePublishedContent(platform, postId, accountId, user.sub);
      return {
        success: true,
        data: { success: true },
        message: '内容删除成功',
      };
    } catch (error) {
      return {
        success: false,
        message: `删除内容失败：${error.message}`,
        code: HttpStatus.BAD_REQUEST,
      };
    }
  }
}