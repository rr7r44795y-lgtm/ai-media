/**
 * 社交平台核心服务
 * 路径：platform/platform.service.ts
 * 封装所有社交平台的授权、账号、发布等业务逻辑，适配多平台适配器，统一处理数据持久化
 */
import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';

// DTO
import {
  ConnectPlatformDto,
  ConnectPlatformResponseDto,
  RefreshPlatformTokenDto,
  RevokePlatformTokenDto,
  PlatformTokenDto,
  PlatformType,
} from './dto/connect-platform.dto';
import { PublishContentDto } from './platform.controller';

// 实体
import { SocialAccountEntity, SocialAccountStatus } from './entities/social-account.entity';

// 适配器
import { FacebookAdapter } from './adapters/facebook.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { YoutubeAdapter } from './adapters/youtube.adapter';
import { LinkedinAdapter } from './adapters/linkedin.adapter';

// 类型
import {
  FacebookPostParams,
  InstagramPostParams,
  YoutubeVideoUploadParams,
  LinkedinPostParams,
} from './adapters';

/**
 * 脱敏令牌（仅显示前8位+***）
 */
const desensitizeToken = (token: string): string => {
  if (!token) return '';
  return token.length <= 8 ? `${token.substring(0, 4)}****` : `${token.substring(0, 8)}***`;
};

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    // 数据库仓库
    @InjectRepository(SocialAccountEntity)
    private readonly socialAccountRepository: Repository<SocialAccountEntity>,

    // 配置服务
    private readonly configService: ConfigService,

    // 平台适配器
    private readonly facebookAdapter: FacebookAdapter,
    private readonly instagramAdapter: InstagramAdapter,
    private readonly youtubeAdapter: YoutubeAdapter,
    private readonly linkedinAdapter: LinkedinAdapter,
  ) {}

  // ------------------------------ 授权管理 ------------------------------
  /**
   * 获取平台授权URL（供前端跳转）
   * @param platform 平台类型
   * @param state 防CSRF状态值
   * @param scope 授权范围
   * @returns 授权URL
   */
  async getAuthUrl(platform: PlatformType, state: string, scope?: string): Promise<string> {
    try {
      switch (platform) {
        case PlatformType.FACEBOOK:
          return this.facebookAdapter.getAuthUrl(state, scope || 'email,public_profile,pages_show_list,pages_manage_posts');
        case PlatformType.INSTAGRAM:
          return this.instagramAdapter.getAuthUrl(state, scope || 'user_profile,user_media');
        case PlatformType.YOUTUBE:
          return this.youtubeAdapter.getAuthUrl(state, scope || 'youtube.upload,youtube.readonly');
        case PlatformType.LINKEDIN:
          return this.linkedinAdapter.getAuthUrl(state, scope || 'r_liteprofile r_emailaddress w_member_social w_organization_social');
        default:
          throw new BadRequestException(`不支持的平台类型：${platform}`);
      }
    } catch (error) {
      this.logger.error(`获取${platform}授权URL失败：${error.message}`);
      throw new BadRequestException(`获取授权URL失败：${error.message}`);
    }
  }

  /**
   * 连接社交平台（授权码换令牌，绑定账号）
   * @param dto 连接参数
   * @param userId 系统用户ID
   * @returns 连接结果
   */
  async connectPlatform(dto: ConnectPlatformDto, userId: string): Promise<ConnectPlatformResponseDto> {
    try {
      let tokenDto: PlatformTokenDto;

      // 根据平台类型处理授权
      switch (dto.platform) {
        case PlatformType.FACEBOOK:
          tokenDto = await this.handleFacebookAuth(dto, userId);
          break;
        case PlatformType.INSTAGRAM:
          tokenDto = await this.handleInstagramAuth(dto, userId);
          break;
        case PlatformType.YOUTUBE:
          tokenDto = await this.handleYoutubeAuth(dto, userId);
          break;
        case PlatformType.LINKEDIN:
          tokenDto = await this.handleLinkedinAuth(dto, userId);
          break;
        default:
          throw new BadRequestException(`不支持的平台类型：${dto.platform}`);
      }

      // 保存/更新账号信息
      const account = await this.saveSocialAccount(tokenDto, userId, dto.nickname);

      // 构建响应（脱敏令牌）
      return this.buildConnectResponse(account);
    } catch (error) {
      this.logger.error(`连接${dto.platform}平台失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 刷新平台令牌
   * @param dto 刷新参数
   * @param userId 系统用户ID
   * @returns 刷新结果
   */
  async refreshPlatformToken(dto: RefreshPlatformTokenDto, userId: string): Promise<ConnectPlatformResponseDto> {
    try {
      // 1. 查询账号信息
      const account = await this.socialAccountRepository.findOne({
        where: {
          id: dto.connectId,
          userId,
          deleteAt: IsNull(),
        },
      });

      if (!account) {
        throw new NotFoundException('平台账号不存在或无访问权限');
      }

      // 2. 根据平台刷新令牌
      let newTokenDto: Partial<PlatformTokenDto>;
      switch (account.platform) {
        case PlatformType.FACEBOOK:
          // Facebook长期令牌无需刷新，直接返回原令牌
          newTokenDto = {
            accessToken: account.getDecryptedAccessToken(),
            expiresIn: account.expiresIn,
          };
          break;
        case PlatformType.LINKEDIN:
          const refreshToken = account.getDecryptedRefreshToken();
          if (!refreshToken) {
            throw new BadRequestException('LinkedIn账号无刷新令牌，无法刷新');
          }
          const linkedinToken = await this.linkedinAdapter.refreshAccessToken(refreshToken);
          newTokenDto = {
            accessToken: linkedinToken.access_token,
            expiresIn: linkedinToken.expires_in.toString(),
            refreshToken: linkedinToken.refresh_token,
            refreshTokenExpiresIn: linkedinToken.refresh_token_expires_in?.toString(),
          };
          break;
        case PlatformType.YOUTUBE:
          const youtubeToken = await this.youtubeAdapter.getAccessToken(); // YouTube自动刷新令牌
          newTokenDto = {
            accessToken: youtubeToken,
            expiresIn: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1小时有效期
          };
          break;
        case PlatformType.INSTAGRAM:
          throw new BadRequestException('Instagram令牌暂不支持刷新，请重新授权');
        default:
          throw new BadRequestException(`不支持的平台类型：${account.platform}`);
      }

      // 3. 更新账号令牌
      account.accessToken = newTokenDto.accessToken!;
      account.expiresIn = newTokenDto.expiresIn!;
      if (newTokenDto.refreshToken) {
        account.refreshToken = newTokenDto.refreshToken;
      }
      if (newTokenDto.refreshTokenExpiresIn) {
        account.refreshTokenExpiresIn = newTokenDto.refreshTokenExpiresIn;
      }
      account.status = SocialAccountStatus.ACTIVE;
      account.updatedAt = new Date();

      const updatedAccount = await this.socialAccountRepository.save(account);

      // 4. 构建响应
      return this.buildConnectResponse(updatedAccount);
    } catch (error) {
      this.logger.error(`刷新平台令牌失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 撤销平台授权（解除绑定）
   * @param dto 撤销参数
   * @param userId 系统用户ID
   */
  async revokePlatformToken(dto: RevokePlatformTokenDto, userId: string): Promise<void> {
    try {
      // 1. 查询账号信息
      const account = await this.socialAccountRepository.findOne({
        where: {
          id: dto.connectId,
          userId,
          deleteAt: IsNull(),
        },
      });

      if (!account) {
        throw new NotFoundException('平台账号不存在或无访问权限');
      }

      // 2. 远程撤销令牌（可选）
      if (dto.revokeRemote) {
        try {
          switch (account.platform) {
            case PlatformType.FACEBOOK:
              await this.facebookAdapter.revokeToken(account.getDecryptedAccessToken());
              break;
            case PlatformType.LINKEDIN:
              await this.linkedinAdapter.revokeToken(account.getDecryptedAccessToken());
              break;
            // YouTube/Instagram暂不支持远程撤销，仅本地标记
            default:
              this.logger.warn(`${account.platform}暂不支持远程撤销令牌`);
          }
        } catch (remoteError) {
          this.logger.warn(`远程撤销${account.platform}令牌失败：${remoteError.message}，继续执行本地撤销`);
        }
      }

      // 3. 本地标记为无效（软删除）
      account.status = SocialAccountStatus.INVALID;
      account.deleteAt = new Date();
      await this.socialAccountRepository.save(account);

      this.logger.log(`用户${userId}撤销${account.platform}账号${account.accountId}授权成功`);
    } catch (error) {
      this.logger.error(`撤销平台授权失败：${error.message}`);
      throw error;
    }
  }

  // ------------------------------ 账号管理 ------------------------------
  /**
   * 获取用户绑定的所有社交账号
   * @param userId 系统用户ID
   * @param platform 可选：筛选指定平台
   * @returns 账号列表
   */
  async getUserSocialAccounts(userId: string, platform?: PlatformType): Promise<ConnectPlatformResponseDto[]> {
    try {
      const where: any = {
        userId,
        deleteAt: IsNull(),
      };

      if (platform) {
        where.platform = platform;
      }

      const accounts = await this.socialAccountRepository.find({
        where,
        order: { createdAt: 'DESC' },
      });

      // 转换为响应DTO（脱敏）
      return accounts.map(account => this.buildConnectResponse(account));
    } catch (error) {
      this.logger.error(`获取用户${userId}社交账号失败：${error.message}`);
      throw new BadRequestException(`获取账号列表失败：${error.message}`);
    }
  }

  /**
   * 获取指定社交账号详情
   * @param connectId 连接ID
   * @param userId 系统用户ID
   * @returns 账号详情
   */
  async getSocialAccountDetail(connectId: string, userId: string): Promise<ConnectPlatformResponseDto | null> {
    try {
      const account = await this.socialAccountRepository.findOne({
        where: {
          id: connectId,
          userId,
          deleteAt: IsNull(),
        },
      });

      if (!account) {
        return null;
      }

      return this.buildConnectResponse(account);
    } catch (error) {
      this.logger.error(`获取账号${connectId}详情失败：${error.message}`);
      throw new BadRequestException(`获取账号详情失败：${error.message}`);
    }
  }

  /**
   * 更新社交账号自定义昵称
   * @param connectId 连接ID
   * @param nickname 新昵称
   * @param userId 系统用户ID
   */
  async updateAccountNickname(connectId: string, nickname: string, userId: string): Promise<void> {
    try {
      const account = await this.socialAccountRepository.findOne({
        where: {
          id: connectId,
          userId,
          deleteAt: IsNull(),
        },
      });

      if (!account) {
        throw new NotFoundException('平台账号不存在或无访问权限');
      }

      account.nickname = nickname.trim();
      account.updatedAt = new Date();
      await this.socialAccountRepository.save(account);

      this.logger.log(`用户${userId}更新${account.platform}账号${connectId}昵称：${nickname}`);
    } catch (error) {
      this.logger.error(`更新账号昵称失败：${error.message}`);
      throw error;
    }
  }

  /**
   * 更新账号状态（启用/禁用）
   * @param connectId 连接ID
   * @param status 目标状态
   * @param userId 系统用户ID
   */
  async updateAccountStatus(connectId: string, status: 'active' | 'disabled', userId: string): Promise<void> {
    try {
      const account = await this.socialAccountRepository.findOne({
        where: {
          id: connectId,
          userId,
          deleteAt: IsNull(),
        },
      });

      if (!account) {
        throw new NotFoundException('平台账号不存在或无访问权限');
      }

      account.status = status === 'active' ? SocialAccountStatus.ACTIVE : SocialAccountStatus.DISABLED;
      account.updatedAt = new Date();
      await this.socialAccountRepository.save(account);

      this.logger.log(`用户${userId}将${account.platform}账号${connectId}状态更新为：${status}`);
    } catch (error) {
      this.logger.error(`更新账号状态失败：${error.message}`);
      throw error;
    }
  }

  // ------------------------------ 内容发布 ------------------------------
  /**
   * 发布内容到指定社交平台
   * @param dto 发布参数
   * @param userId 系统用户ID
   * @returns 发布结果
   */
  async publishContent(dto: PublishContentDto, userId: string): Promise<{ postId: string; platform: PlatformType }> {
    try {
      // 1. 获取用户绑定的平台账号
      const account = await this.getValidSocialAccount(userId, dto.platform, dto.accountId);
      if (!account || !account.isActive()) {
        throw new BadRequestException(`${dto.platform}账号无效或已过期，请重新绑定`);
      }

      // 2. 获取解密后的令牌
      const accessToken = account.getDecryptedAccessToken();

      // 3. 根据平台发布内容
      let postId: string;
      switch (dto.platform) {
        case PlatformType.FACEBOOK:
          const fbParams = dto.postParams as FacebookPostParams;
          // 若未指定页面ID，使用账号默认页面ID
          fbParams.pageId = fbParams.pageId || account.extend?.pageId;
          const fbResult = await this.facebookAdapter.publishPost(fbParams, accessToken);
          postId = fbResult.postId;
          break;
        case PlatformType.INSTAGRAM:
          const igParams = dto.postParams as InstagramPostParams;
          const igResult = await this.instagramAdapter.publishPost(igParams, accessToken);
          postId = igResult.mediaId;
          break;
        case PlatformType.YOUTUBE:
          const ytParams = dto.postParams as YoutubeVideoUploadParams;
          const ytResult = await this.youtubeAdapter.uploadVideo(ytParams);
          postId = ytResult.id;
          break;
        case PlatformType.LINKEDIN:
          const liParams = dto.postParams as LinkedinPostParams;
          const liResult = await this.linkedinAdapter.publishPost(liParams, accessToken);
          postId = liResult.commentId; // LinkedIn帖子ID为commentId
          break;
        default:
          throw new BadRequestException(`不支持的平台类型：${dto.platform}`);
      }

      this.logger.log(`用户${userId}发布内容到${dto.platform}成功，ID：${postId}`);

      // 4. 可选：记录发布日志（可扩展实体存储）
      // await this.savePublishLog(userId, dto.platform, postId, dto.postParams);

      return {
        postId,
        platform: dto.platform,
      };
    } catch (error) {
      this.logger.error(`发布内容到${dto.platform}失败：${error.message}`);
      throw new BadRequestException(`发布失败：${error.message}`);
    }
  }

  /**
   * 获取已发布的内容列表
   * @param platform 平台类型
   * @param accountId 账号ID
   * @param page 页码
   * @param size 每页数量
   * @param userId 系统用户ID
   * @returns 内容列表
   */
  async getPublishedContent(
    platform: PlatformType,
    accountId: string | undefined,
    page: number,
    size: number,
    userId: string,
  ): Promise<{ list: any[]; total: number; page: number; size: number }> {
    try {
      // 1. 获取用户绑定的平台账号
      const account = await this.getValidSocialAccount(userId, platform, accountId);
      if (!account || !account.isActive()) {
        throw new BadRequestException(`${platform}账号无效或已过期，请重新绑定`);
      }

      const accessToken = account.getDecryptedAccessToken();
      const skip = (page - 1) * size;

      // 2. 根据平台获取内容列表
      let list: any[] = [];
      let total = 0;

      switch (platform) {
        case PlatformType.FACEBOOK:
          const fbResult = await this.facebookAdapter.getPagePosts(
            account.extend?.pageId || account.accountId,
            size,
            skip,
            accessToken,
          );
          list = fbResult.items;
          total = fbResult.pageInfo.totalResults;
          break;
        case PlatformType.INSTAGRAM:
          const igResult = await this.instagramAdapter.getUserMedia(
            account.accountId,
            size,
            skip,
            accessToken,
          );
          list = igResult.data;
          total = igResult.paging?.total || list.length;
          break;
        case PlatformType.YOUTUBE:
          const ytResult = await this.youtubeAdapter.getChannelVideos(
            account.extend?.channelId || account.accountId,
            size,
          );
          list = ytResult.items;
          total = ytResult.pageInfo.totalResults;
          break;
        case PlatformType.LINKEDIN:
          const liResult = await this.linkedinAdapter.getOrganizationPosts(
            account.extend?.organizationId || account.accountId,
            size,
            skip,
            accessToken,
          );
          list = liResult.elements || [];
          total = liResult.paging?.count || list.length;
          break;
        default:
          throw new BadRequestException(`不支持的平台类型：${platform}`);
      }

      return {
        list,
        total,
        page,
        size,
      };
    } catch (error) {
      this.logger.error(`获取${platform}已发布内容失败：${error.message}`);
      throw new BadRequestException(`获取内容失败：${error.message}`);
    }
  }

  /**
   * 删除平台已发布的内容
   * @param platform 平台类型
   * @param postId 内容ID
   * @param accountId 账号ID
   * @param userId 系统用户ID
   */
  async deletePublishedContent(
    platform: PlatformType,
    postId: string,
    accountId: string | undefined,
    userId: string,
  ): Promise<void> {
    try {
      // 1. 获取用户绑定的平台账号
      const account = await this.getValidSocialAccount(userId, platform, accountId);
      if (!account || !account.isActive()) {
        throw new BadRequestException(`${platform}账号无效或已过期，请重新绑定`);
      }

      const accessToken = account.getDecryptedAccessToken();

      // 2. 根据平台删除内容
      switch (platform) {
        case PlatformType.FACEBOOK:
          await this.facebookAdapter.deletePost(postId, accessToken);
          break;
        case PlatformType.INSTAGRAM:
          await this.instagramAdapter.deleteMedia(postId, accessToken);
          break;
        case PlatformType.YOUTUBE:
          await this.youtubeAdapter.deleteVideo(postId);
          break;
        case PlatformType.LINKEDIN:
          await this.linkedinAdapter.deletePost(postId, accessToken);
          break;
        default:
          throw new BadRequestException(`不支持的平台类型：${platform}`);
      }

      this.logger.log(`用户${userId}删除${platform}内容${postId}成功`);
    } catch (error) {
      this.logger.error(`删除${platform}内容${postId}失败：${error.message}`);
      throw new BadRequestException(`删除失败：${error.message}`);
    }
  }

  // ------------------------------ 私有辅助方法 ------------------------------
  /**
   * 处理Facebook授权
   */
  private async handleFacebookAuth(dto: ConnectPlatformDto, userId: string): Promise<PlatformTokenDto> {
    // 1. 获取长期令牌
    const longLivedToken = await this.facebookAdapter.getLongLivedToken(dto.code!, dto.redirectUri);

    // 2. 验证令牌并获取用户信息
    const userInfo = await this.facebookAdapter.verifyAuthToken(longLivedToken.access_token);

    // 3. 获取用户绑定的页面（可选）
    const pages = await this.facebookAdapter.getUserPages(longLivedToken.access_token);
    const defaultPage = pages.length > 0 ? pages[0] : null;

    // 4. 构建令牌DTO
    return {
      platform: PlatformType.FACEBOOK,
      accessToken: longLivedToken.access_token,
      expiresIn: longLivedToken.expires_in.toString(),
      refreshToken: undefined, // Facebook长期令牌无需刷新
      accountId: userInfo.user_id,
      accountName: userInfo.name || '',
      scope: dto.scope || 'email,public_profile,pages_show_list,pages_manage_posts',
      userId,
    };
  }

  /**
   * 处理Instagram授权
   */
  private async handleInstagramAuth(dto: ConnectPlatformDto, userId: string): Promise<PlatformTokenDto> {
    // 1. 获取访问令牌
    const token = await this.instagramAdapter.getAccessToken(dto.code!, dto.redirectUri);

    // 2. 获取用户信息
    const userInfo = await this.instagramAdapter.getUserInfo(token.access_token);

    // 3. 构建令牌DTO
    return {
      platform: PlatformType.INSTAGRAM,
      accessToken: token.access_token,
      expiresIn: token.expires_in.toString(),
      refreshToken: token.refresh_token,
      accountId: userInfo.id,
      accountName: userInfo.username || '',
      scope: dto.scope || 'user_profile,user_media',
      userId,
    };
  }

  /**
   * 处理YouTube授权
   */
  private async handleYoutubeAuth(dto: ConnectPlatformDto, userId: string): Promise<PlatformTokenDto> {
    // YouTube使用刷新令牌模式，授权码换刷新令牌（简化处理，实际需适配OAuth流程）
    const youtubeToken = await this.youtubeAdapter.getAccessToken();

    // 获取频道信息
    const channelInfo = await this.youtubeAdapter.getChannelInfo(youtubeToken);

    return {
      platform: PlatformType.YOUTUBE,
      accessToken: youtubeToken,
      expiresIn: (Math.floor(Date.now() / 1000) + 3600).toString(), // 1小时有效期
      refreshToken: this.configService.get<string>('YOUTUBE_REFRESH_TOKEN'),
      accountId: channelInfo.id,
      accountName: channelInfo.snippet.title,
      scope: dto.scope || 'youtube.upload,youtube.readonly',
      userId,
    };
  }

  /**
   * 处理LinkedIn授权
   */
  private async handleLinkedinAuth(dto: ConnectPlatformDto, userId: string): Promise<PlatformTokenDto> {
    // 1. 获取访问令牌
    const token = await this.linkedinAdapter.getAccessTokenByCode(dto.code!, dto.redirectUri);

    // 2. 获取用户信息
    const userInfo = await this.linkedinAdapter.getUserInfo(token.access_token);

    // 3. 获取公司信息（可选）
    const orgInfo = await this.linkedinAdapter.getOrganizationInfo(undefined, token.access_token);

    // 4. 构建令牌DTO
    return {
      platform: PlatformType.LINKEDIN,
      accessToken: token.access_token,
      expiresIn: token.expires_in.toString(),
      refreshToken: token.refresh_token,
      refreshTokenExpiresIn: token.refresh_token_expires_in?.toString(),
      accountId: userInfo.id,
      accountName: userInfo.localizedFirstName + ' ' + userInfo.localizedLastName,
      scope: dto.scope || 'r_liteprofile r_emailaddress w_member_social w_organization_social',
      userId,
    };
  }

  /**
   * 保存/更新社交账号信息
   */
  private async saveSocialAccount(tokenDto: PlatformTokenDto, userId: string, nickname?: string): Promise<SocialAccountEntity> {
    // 1. 查询是否已存在该平台账号
    const existingAccount = await this.socialAccountRepository.findOne({
      where: {
        userId,
        platform: tokenDto.platform,
        accountId: tokenDto.accountId,
        deleteAt: IsNull(),
      },
    });

    if (existingAccount) {
      // 2. 存在则更新
      existingAccount.accessToken = tokenDto.accessToken;
      existingAccount.expiresIn = tokenDto.expiresIn;
      existingAccount.refreshToken = tokenDto.refreshToken;
      existingAccount.refreshTokenExpiresIn = tokenDto.refreshTokenExpiresIn;
      existingAccount.scope = tokenDto.scope;
      existingAccount.status = SocialAccountStatus.ACTIVE;
      existingAccount.nickname = nickname || existingAccount.nickname;
      existingAccount.updatedAt = new Date();

      return await this.socialAccountRepository.save(existingAccount);
    } else {
      // 3. 不存在则创建
      const newAccount = this.socialAccountRepository.create({
        userId,
        platform: tokenDto.platform,
        accountId: tokenDto.accountId,
        accountName: tokenDto.accountName,
        accessToken: tokenDto.accessToken,
        expiresIn: tokenDto.expiresIn,
        refreshToken: tokenDto.refreshToken,
        refreshTokenExpiresIn: tokenDto.refreshTokenExpiresIn,
        scope: tokenDto.scope,
        nickname: nickname,
        status: SocialAccountStatus.ACTIVE,
        extend: {}, // 初始化扩展字段
      });

      return await this.socialAccountRepository.save(newAccount);
    }
  }

  /**
   * 构建连接响应DTO（脱敏）
   */
  private buildConnectResponse(account: SocialAccountEntity): ConnectPlatformResponseDto {
    return {
      id: account.id,
      platform: account.platform,
      accountName: account.accountName,
      accountId: account.accountId,
      accessToken: desensitizeToken(account.accessToken),
      expiresIn: account.expiresIn,
      refreshToken: account.refreshToken ? desensitizeToken(account.refreshToken) : undefined,
      scope: account.scope,
      nickname: account.nickname,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      status: account.status,
    };
  }

  /**
   * 获取有效的社交账号
   */
  private async getValidSocialAccount(
    userId: string,
    platform: PlatformType,
    accountId?: string,
  ): Promise<SocialAccountEntity | null> {
    const where: any = {
      userId,
      platform,
      deleteAt: IsNull(),
      status: Not(SocialAccountStatus.INVALID),
    };

    if (accountId) {
      where.accountId = accountId;
    }

    // 优先获取active状态的账号，无则获取未过期的账号
    let account = await this.socialAccountRepository.findOne({
      where: { ...where, status: SocialAccountStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    if (!account) {
      account = await this.socialAccountRepository.findOne({
        where,
        order: { createdAt: 'DESC' },
      });
    }

    return account;
  }
}