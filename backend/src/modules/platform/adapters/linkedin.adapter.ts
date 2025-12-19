/**
 * LinkedIn平台适配器
 * 路径：platform/adapters/linkedin.adapter.ts
 * 基于LinkedIn Marketing API v2封装，支持帖子发布、公司主页管理、互动数据统计等核心能力
 * 适配NestJS依赖注入，与项目现有架构统一
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import * as querystring from 'querystring';

/**
 * LinkedIn API响应通用类型
 */
type LinkedinApiResponse<T = any> = {
  data?: T;
  elements?: T[];
  paging?: {
    count: number;
    start: number;
    links?: Array<{
      rel: string;
      href: string;
      type: string;
    }>;
  };
  error?: {
    status: number;
    message: string;
    code: string;
    details?: Array<{
      message: string;
      type: string;
      target: string;
    }>;
  };
};

/**
 * LinkedIn访问令牌响应类型
 */
type LinkedinTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope: string;
  token_type: string;
};

/**
 * LinkedIn帖子发布参数类型
 */
export type LinkedinPostParams = {
  text: string; // 帖子正文
  title?: string; // 内容标题（用于文章/链接）
  description?: string; // 内容描述
  link?: string; // 关联链接
  imageUrls?: string[]; // 图片URL列表（最多9张）
  videoUrl?: string; // 视频URL（仅支持LinkedIn托管视频）
  authorType: 'PERSON' | 'ORGANIZATION'; // 发布者类型（个人/公司）
  authorId: string; // 发布者ID（个人ID/公司ID）
  visibility?: 'PUBLIC' | 'CONNECTIONS' | 'LOGGED_IN'; // 可见性
  scheduledAt?: string; // 定时发布时间（ISO 8601格式，如2025-12-31T23:59:59Z）
};

/**
 * LinkedIn帖子信息类型
 */
export type LinkedinPostInfo = {
  id: string;
  author: {
    id: string;
    type: 'PERSON' | 'ORGANIZATION';
  };
  lifecycleState: 'PUBLISHED' | 'SCHEDULED' | 'DRAFT' | 'DELETED';
  created: string;
  lastModified: string;
  visibility: {
    code: 'PUBLIC' | 'CONNECTIONS' | 'LOGGED_IN';
  };
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: {
        text: string;
      };
      shareMediaCategory: 'NONE' | 'ARTICLE' | 'IMAGE' | 'VIDEO';
      media?: Array<{
        status: 'READY' | 'PROCESSING';
        description?: { text: string };
        title?: { text: string };
        originalUrl?: string;
        media?: {
          id: string;
          status: 'READY';
        };
      }>;
    };
  };
  statistics?: {
    likeCount: number;
    commentCount: number;
    shareCount: number;
    viewCount: number;
  };
};

/**
 * LinkedIn公司主页信息类型
 */
export type LinkedinOrganizationInfo = {
  id: string;
  name: string;
  vanityName: string;
  logoUrl: string;
  website: string;
  industry: string;
  employeeCountRange: string;
};

/**
 * LinkedIn适配器核心类
 */
@Injectable()
export class LinkedinAdapter {
  private readonly logger = new Logger(LinkedinAdapter.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly apiBaseUrl = 'https://api.linkedin.com/v2';
  private readonly authBaseUrl = 'https://www.linkedin.com/oauth/v2';
  
  // 配置参数
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly defaultAccessToken: string;
  private readonly defaultOrganizationId: string; // 默认公司主页ID

  constructor(private readonly configService: ConfigService) {
    // 从配置读取LinkedIn信息
    this.clientId = this.configService.get<string>('LINKEDIN_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('LINKEDIN_CLIENT_SECRET', '');
    this.redirectUri = this.configService.get<string>('LINKEDIN_REDIRECT_URI', '');
    this.defaultAccessToken = this.configService.get<string>('LINKEDIN_ACCESS_TOKEN', '');
    this.defaultOrganizationId = this.configService.get<string>('LINKEDIN_ORGANIZATION_ID', '');

    // 初始化Axios实例
    this.axiosInstance = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0', // LinkedIn要求的协议版本
      },
    });

    // 请求拦截器：自动添加访问令牌
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (!config.headers['Authorization'] && this.defaultAccessToken) {
          config.headers['Authorization'] = `Bearer ${this.defaultAccessToken}`;
        }
        this.logger.debug(`【LinkedIn API】请求：${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器：统一处理错误
    this.axiosInstance.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError) => {
        const response = error.response?.data as LinkedinApiResponse;
        const errorMsg = response?.error?.message || error.message || 'LinkedIn API请求失败';
        const errorCode = response?.error?.status || error.response?.status || 500;

        this.logger.error(`【LinkedIn API】错误：${errorCode} → ${errorMsg}`);
        throw new HttpException(
          `LinkedIn平台错误：${errorMsg}`,
          errorCode === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY,
        );
      }
    );

    // 校验配置
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('【LinkedIn Adapter】未配置CLIENT_ID/CLIENT_SECRET，授权功能不可用');
    }
    if (!this.defaultAccessToken) {
      this.logger.warn('【LinkedIn Adapter】未配置ACCESS_TOKEN，API调用功能不可用');
    }
  }

  /**
   * 1. 获取LinkedIn授权URL（用于前端跳转授权）
   * @param state 防CSRF令牌
   * @param scope 授权范围（默认包含发布、读取权限）
   * @returns 授权URL
   */
  getAuthUrl(state: string, scope: string = 'r_liteprofile r_emailaddress w_member_social w_organization_social'): string {
    const params = querystring.stringify({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scope,
      state: state,
    });
    return `${this.authBaseUrl}/authorization?${params}`;
  }

  /**
   * 2. 通过授权码获取访问令牌
   * @param code 授权码
   * @returns 令牌信息
   */
  async getAccessTokenByCode(code: string): Promise<LinkedinTokenResponse> {
    try {
      const params = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      };

      const response = await axios.post<LinkedinTokenResponse>(
        `${this.authBaseUrl}/accessToken`,
        querystring.stringify(params),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      this.logger.log('【LinkedIn Adapter】获取访问令牌成功');
      return response.data;
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】获取访问令牌失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 3. 刷新访问令牌
   * @param refreshToken 刷新令牌
   * @returns 新的令牌信息
   */
  async refreshAccessToken(refreshToken: string): Promise<LinkedinTokenResponse> {
    try {
      const params = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      };

      const response = await axios.post<LinkedinTokenResponse>(
        `${this.authBaseUrl}/accessToken`,
        querystring.stringify(params),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      this.logger.log('【LinkedIn Adapter】刷新访问令牌成功');
      return response.data;
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】刷新访问令牌失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 4. 发布帖子到LinkedIn（核心功能）
   * @param params 发布参数
   * @param accessToken 访问令牌（默认使用配置的令牌）
   * @returns 帖子信息
   */
  async publishPost(params: LinkedinPostParams, accessToken?: string): Promise<LinkedinPostInfo> {
    try {
      const token = accessToken || this.defaultAccessToken;
      if (!token) {
        throw new HttpException('未配置LinkedIn访问令牌', HttpStatus.BAD_REQUEST);
      }

      // 构建发布者ID（格式：urn:li:person:{id} 或 urn:li:organization:{id}）
      const authorUrn = `urn:li:${params.authorType.toLowerCase()}:${params.authorId || this.defaultOrganizationId}`;
      
      // 构建媒体内容
      let mediaItems = [];
      if (params.imageUrls && params.imageUrls.length > 0) {
        // 上传图片并获取媒体ID（LinkedIn需要先上传媒体）
        mediaItems = await Promise.all(
          params.imageUrls.slice(0, 9).map(async (imageUrl) => {
            const mediaId = await this.uploadImage(imageUrl, authorUrn, token);
            return {
              status: 'READY',
              media: {
                id: mediaId,
                status: 'READY',
              },
              title: { text: params.title || '' },
              description: { text: params.description || '' },
            };
          })
        );
      } else if (params.videoUrl) {
        // 视频发布需先上传到LinkedIn托管，此处简化处理
        mediaItems = [{
          status: 'READY',
          media: {
            id: params.videoUrl, // 实际需替换为上传后的视频媒体ID
            status: 'READY',
          },
        }];
      }

      // 构建帖子内容
      const postData = {
        author: authorUrn,
        lifecycleState: params.scheduledAt ? 'SCHEDULED' : 'PUBLISHED',
        scheduledAt: params.scheduledAt,
        visibility: {
          com.linkedin.ugc.MemberNetworkVisibility: params.visibility || 'PUBLIC',
        },
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: params.text,
            },
            shareMediaCategory: mediaItems.length > 0 
              ? (params.videoUrl ? 'VIDEO' : 'IMAGE') 
              : (params.link ? 'ARTICLE' : 'NONE'),
            media: mediaItems.length > 0 ? mediaItems : undefined,
            article: params.link ? {
              source: params.link,
              title: params.title || '',
              description: params.description || '',
            } : undefined,
          },
        },
      };

      // 发布帖子
      const response = await this.axiosInstance.post<LinkedinApiResponse<{ id: string }>>(
        '/ugcPosts',
        postData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.data?.id) {
        throw new HttpException('帖子发布失败，未返回帖子ID', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.log(`【LinkedIn Adapter】帖子发布成功：${response.data.id}`);
      
      // 获取帖子完整信息
      return await this.getPostInfo(response.data.id, token);
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】发布帖子失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 5. 上传图片到LinkedIn媒体库
   * @param imageUrl 图片URL
   * @param authorUrn 发布者URN
   * @param accessToken 访问令牌
   * @returns 媒体ID
   */
  private async uploadImage(imageUrl: string, authorUrn: string, accessToken: string): Promise<string> {
    try {
      // 步骤1：初始化媒体上传
      const initResponse = await this.axiosInstance.post<{ value: string }>(
        '/assets?action=registerUpload',
        {
          registerUploadRequest: {
            owner: authorUrn,
            recipes: ['urn:li:digitalmediaRecipe:feed-image'],
            serviceRelationships: [
              {
                identifier: 'urn:li:userGeneratedContent',
                relationshipType: 'OWNER',
              },
            ],
            supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
          },
        },
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      const uploadUrl = initResponse.value.match(/(https?:\/\/[^\s]+)/)?.[0];
      if (!uploadUrl) {
        throw new HttpException('获取图片上传URL失败', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 步骤2：下载图片并上传到LinkedIn
      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      await axios.put(uploadUrl, imageResponse.data, {
        headers: {
          'Content-Type': 'image/jpeg', // 支持jpg/png，需根据实际调整
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // 步骤3：提取媒体ID
      const mediaIdMatch = initResponse.value.match(/urn:li:digitalmediaAsset:([^:]+)/);
      if (!mediaIdMatch) {
        throw new HttpException('提取媒体ID失败', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return mediaIdMatch[1];
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】上传图片失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 6. 获取帖子详情
   * @param postId 帖子ID（完整URN或短ID）
   * @param accessToken 访问令牌
   * @returns 帖子完整信息
   */
  async getPostInfo(postId: string, accessToken?: string): Promise<LinkedinPostInfo> {
    try {
      const token = accessToken || this.defaultAccessToken;
      // 补全帖子URN（若传入的是短ID）
      const postUrn = postId.startsWith('urn:li:ugcPost:') 
        ? postId 
        : `urn:li:ugcPost:${postId}`;

      const response = await this.axiosInstance.get<LinkedinApiResponse<LinkedinPostInfo>>(
        `/ugcPosts/${encodeURIComponent(postUrn)}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            projection: '(id,author,lifecycleState,created,lastModified,visibility,specificContent,statistics)',
          },
        }
      );

      if (!response.data) {
        throw new HttpException(`帖子不存在：${postId}`, HttpStatus.NOT_FOUND);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】获取帖子信息失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 7. 获取公司主页信息
   * @param organizationId 公司ID（默认使用配置的ID）
   * @param accessToken 访问令牌
   * @returns 公司主页信息
   */
  async getOrganizationInfo(organizationId?: string, accessToken?: string): Promise<LinkedinOrganizationInfo> {
    try {
      const orgId = organizationId || this.defaultOrganizationId;
      const token = accessToken || this.defaultAccessToken;

      if (!orgId) {
        throw new HttpException('未配置LinkedIn公司ID', HttpStatus.BAD_REQUEST);
      }

      const response = await this.axiosInstance.get<LinkedinApiResponse<LinkedinOrganizationInfo>>(
        `/organizations/${orgId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            projection: '(id,name,vanityName,logoUrl,website,industry,employeeCountRange)',
          },
        }
      );

      if (!response.data) {
        throw new HttpException(`公司主页不存在：${orgId}`, HttpStatus.NOT_FOUND);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】获取公司信息失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 8. 获取公司主页帖子列表
   * @param organizationId 公司ID（默认使用配置的ID）
   * @param limit 数量（默认20）
   * @param start 起始位置（默认0）
   * @param accessToken 访问令牌
   * @returns 帖子列表
   */
  async getOrganizationPosts(
    organizationId?: string,
    limit: number = 20,
    start: number = 0,
    accessToken?: string
  ): Promise<LinkedinApiResponse<LinkedinPostInfo>> {
    try {
      const orgId = organizationId || this.defaultOrganizationId;
      const token = accessToken || this.defaultAccessToken;

      if (!orgId) {
        throw new HttpException('未配置LinkedIn公司ID', HttpStatus.BAD_REQUEST);
      }

      const response = await this.axiosInstance.get<LinkedinApiResponse<LinkedinPostInfo>>(
        `/ugcPosts`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            q: 'author',
            author: `urn:li:organization:${orgId}`,
            projection: '(elements*(id,author,lifecycleState,created,specificContent,statistics),paging)',
            count: limit,
            start: start,
          },
        }
      );

      return response;
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】获取公司帖子失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 9. 删除LinkedIn帖子
   * @param postId 帖子ID
   * @param accessToken 访问令牌
   * @returns 删除结果
   */
  async deletePost(postId: string, accessToken?: string): Promise<{ success: boolean }> {
    try {
      const token = accessToken || this.defaultAccessToken;
      const postUrn = postId.startsWith('urn:li:ugcPost:') 
        ? postId 
        : `urn:li:ugcPost:${postId}`;

      await this.axiosInstance.delete(
        `/ugcPosts/${encodeURIComponent(postUrn)}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      this.logger.log(`【LinkedIn Adapter】删除帖子成功：${postId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】删除帖子失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 10. 通用LinkedIn API调用方法（扩展用）
   * @param path API路径
   * @param config Axios配置
   * @returns API响应
   */
  async request<T = any>(
    path: string,
    config: AxiosRequestConfig = {}
  ): Promise<LinkedinApiResponse<T>> {
    try {
      return await this.axiosInstance.request<LinkedinApiResponse<T>>({
        url: path,
        ...config,
      });
    } catch (error) {
      this.logger.error(`【LinkedIn Adapter】通用请求失败：${(error as Error).message}`);
      throw error;
    }
  }
}