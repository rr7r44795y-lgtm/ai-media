/**
 * Instagram平台适配器
 * 路径：platform/adapters/instagram.adapter.ts
 * 基于Facebook Graph API封装（Instagram Business API依赖Facebook生态）
 * 适配NestJS依赖注入，无跨模块强依赖
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { FacebookAdapter } from './facebook.adapter'; // 复用Facebook基础能力

/**
 * Instagram API响应通用类型
 */
type InstagramApiResponse<T = any> = {
  data: T;
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
};

/**
 * Instagram登录授权返回类型
 */
export type InstagramAuthResponse = {
  access_token: string;
  expires_in: number;
  user_id: string;
  username: string;
  account_type: 'BUSINESS' | 'CREATOR' | 'PERSONAL';
  profile_picture_url?: string;
  full_name?: string;
  email?: string;
};

/**
 * Instagram内容发布参数类型
 */
export type InstagramPostParams = {
  caption?: string; // 文案（支持emoji、@提及、#话题）
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'; // 媒体类型
  image_url?: string; // 图片URL（IMAGE/CAROUSEL_ALBUM）
  video_url?: string; // 视频URL（VIDEO）
  carousel_media?: Array<{
    media_type: 'IMAGE' | 'VIDEO';
    image_url?: string;
    video_url?: string;
  }>; // 多图/多视频（CAROUSEL_ALBUM）
  location_id?: string; // 位置ID
  user_tags?: Array<{
    username: string;
    x: number; // 横坐标（0-1）
    y: number; // 纵坐标（0-1）
  }>; // 用户标签
  is_carousel_item?: boolean; // 是否为轮播项
};

/**
 * Instagram内容发布返回类型
 */
export type InstagramPostResponse = {
  id: string; // 媒体ID
  creation_id: string; // 创建ID
  status: 'PUBLISHED' | 'PENDING' | 'FAILED';
};

/**
 * Instagram媒体信息类型
 */
export type InstagramMedia = {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | 'STORY';
  media_url: string;
  caption?: string;
  timestamp: string;
  username: string;
  permalink: string; // 永久链接
  like_count?: number;
  comment_count?: number;
  insights?: {
    reach: number;
    impressions: number;
  };
};

/**
 * Instagram适配器核心类
 */
@Injectable()
export class InstagramAdapter {
  private readonly logger = new Logger(InstagramAdapter.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://graph.facebook.com/v19.0'; // Instagram API基于Facebook Graph API
  private readonly instagramBusinessAccountId: string; // Instagram企业账号ID
  private readonly facebookPageId: string; // 关联的Facebook页面ID

  constructor(
    private readonly configService: ConfigService,
    private readonly facebookAdapter: FacebookAdapter, // 注入Facebook适配器
  ) {
    // 从配置读取Instagram信息
    this.instagramBusinessAccountId = this.configService.get<string>(
      'INSTAGRAM_BUSINESS_ACCOUNT_ID',
      '',
    );
    this.facebookPageId = this.configService.get<string>(
      'FACEBOOK_DEFAULT_PAGE_ID',
      '',
    );

    // 初始化Axios实例
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000, // Instagram API响应较慢，延长超时
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // 请求拦截器
    this.axiosInstance.interceptors.request.use((config) => {
      this.logger.debug(`【Instagram API】请求：${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // 响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError) => {
        const response = error.response?.data as InstagramApiResponse;
        const errorMsg = response?.error?.message || error.message || 'Instagram API请求失败';
        const errorCode = response?.error?.code || error.response?.status || 500;

        this.logger.error(`【Instagram API】错误：${errorCode} → ${errorMsg}`);
        throw new HttpException(
          `Instagram平台错误：${errorMsg}`,
          errorCode === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY,
        );
      },
    );

    // 校验配置
    if (!this.instagramBusinessAccountId || !this.facebookPageId) {
      this.logger.warn('【Instagram Adapter】未配置企业账号ID/Facebook页面ID，部分功能不可用');
    }
  }

  /**
   * 1. 获取Instagram企业账号信息（关联Facebook页面）
   * @param accessToken Facebook页面访问令牌
   * @returns 企业账号信息
   */
  async getInstagramBusinessAccount(accessToken?: string): Promise<{
    id: string;
    name: string;
    username: string;
    profile_picture_url: string;
  }> {
    try {
      const token = accessToken || this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN');
      if (!token || !this.facebookPageId) {
        throw new HttpException('缺少Facebook页面令牌/页面ID', HttpStatus.BAD_REQUEST);
      }

      const params = {
        fields: 'instagram_business_account{id,name,username,profile_picture_url}',
        access_token: token,
      };

      const response = await this.axiosInstance.get<{
        instagram_business_account: {
          id: string;
          name: string;
          username: string;
          profile_picture_url: string;
        };
      }>(`/${this.facebookPageId}`, { params });

      if (!response.instagram_business_account) {
        throw new HttpException('Facebook页面未关联Instagram企业账号', HttpStatus.NOT_FOUND);
      }

      return response.instagram_business_account;
    } catch (error) {
      this.logger.error(`【Instagram Adapter】获取企业账号信息失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 2. 验证Instagram访问令牌并获取用户信息
   * @param accessToken 访问令牌
   * @returns 用户信息
   */
  async verifyAuthToken(accessToken: string): Promise<InstagramAuthResponse> {
    try {
      // 第一步：通过Facebook调试令牌接口校验
      const debugResponse = await this.facebookAdapter.request<{
        data: {
          is_valid: boolean;
          user_id: string;
          expires_at: number;
        };
      }>('/debug_token', {
        params: {
          input_token: accessToken,
          access_token: `${this.configService.get('FACEBOOK_APP_ID')}|${this.configService.get('FACEBOOK_APP_SECRET')}`,
        },
      });

      if (!debugResponse.data.is_valid) {
        throw new HttpException('Instagram令牌无效', HttpStatus.UNAUTHORIZED);
      }

      // 第二步：获取Instagram用户信息
      const userParams = {
        fields: 'id,username,account_type,profile_picture_url,full_name,email',
        access_token: accessToken,
      };

      const userResponse = await this.axiosInstance.get<InstagramAuthResponse>(
        `/${debugResponse.data.user_id}`,
        { params: userParams },
      );

      return {
        access_token: accessToken,
        expires_in: debugResponse.data.expires_at - Math.floor(Date.now() / 1000),
        user_id: userResponse.id,
        username: userResponse.username,
        account_type: userResponse.account_type,
        profile_picture_url: userResponse.profile_picture_url,
        full_name: userResponse.full_name,
        email: userResponse.email,
      };
    } catch (error) {
      this.logger.error(`【Instagram Adapter】验证令牌失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 3. 创建Instagram媒体容器（发布前必须步骤）
   * @param params 发布参数
   * @param accessToken 访问令牌
   * @returns 媒体容器ID
   */
  private async createMediaContainer(
    params: InstagramPostParams,
    accessToken?: string,
  ): Promise<string> {
    try {
      const accountId = this.instagramBusinessAccountId || (await this.getInstagramBusinessAccount(accessToken)).id;
      const token = accessToken || this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN');

      if (!accountId || !token) {
        throw new HttpException('缺少Instagram企业账号ID/访问令牌', HttpStatus.BAD_REQUEST);
      }

      // 构建容器参数
      const containerData: Record<string, any> = {
        media_type: params.media_type,
        caption: params.caption || '',
        access_token: token,
      };

      // 根据媒体类型补充参数
      if (params.media_type === 'IMAGE' && params.image_url) {
        containerData.image_url = params.image_url;
      } else if (params.media_type === 'VIDEO' && params.video_url) {
        containerData.video_url = params.video_url;
      } else if (params.media_type === 'CAROUSEL_ALBUM' && params.carousel_media) {
        containerData.carousel_media = JSON.stringify(params.carousel_media);
      }

      // 可选参数
      if (params.location_id) containerData.location_id = params.location_id;
      if (params.user_tags) containerData.user_tags = JSON.stringify(params.user_tags);

      // 创建容器
      const response = await this.axiosInstance.post<{ id: string }>(
        `/${accountId}/media`,
        containerData,
      );

      this.logger.log(`【Instagram Adapter】创建媒体容器成功：${response.id}`);
      return response.id;
    } catch (error) {
      this.logger.error(`【Instagram Adapter】创建媒体容器失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 4. 发布内容到Instagram（企业账号）
   * @param params 发布参数
   * @param accessToken 访问令牌
   * @returns 发布结果
   */
  async publishPost(
    params: InstagramPostParams,
    accessToken?: string,
  ): Promise<InstagramPostResponse> {
    try {
      // 步骤1：创建媒体容器
      const containerId = await this.createMediaContainer(params, accessToken);
      const accountId = this.instagramBusinessAccountId || (await this.getInstagramBusinessAccount(accessToken)).id;
      const token = accessToken || this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN');

      // 步骤2：发布容器内容
      const publishData = {
        creation_id: containerId,
        access_token: token,
      };

      const response = await this.axiosInstance.post<InstagramPostResponse>(
        `/${accountId}/media_publish`,
        publishData,
      );

      // 步骤3：轮询检查发布状态（Instagram发布异步）
      let status = 'PENDING';
      let mediaId = response.id;
      let retryCount = 0;

      while (status === 'PENDING' && retryCount < 10) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 每2秒检查一次
        const statusResponse = await this.getMediaInfo(mediaId, token);
        status = statusResponse.status || 'PENDING';
        retryCount++;
      }

      this.logger.log(`【Instagram Adapter】发布内容成功：${mediaId}（状态：${status}）`);
      return {
        id: mediaId,
        creation_id: containerId,
        status: status as 'PUBLISHED' | 'PENDING' | 'FAILED',
      };
    } catch (error) {
      this.logger.error(`【Instagram Adapter】发布内容失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 5. 获取Instagram媒体详情
   * @param mediaId 媒体ID
   * @param accessToken 访问令牌
   * @returns 媒体信息
   */
  async getMediaInfo(
    mediaId: string,
    accessToken?: string,
  ): Promise<InstagramMedia & { status?: string }> {
    try {
      const token = accessToken || this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN');
      if (!token) {
        throw new HttpException('缺少Instagram访问令牌', HttpStatus.BAD_REQUEST);
      }

      const params = {
        fields: 'id,media_type,media_url,caption,timestamp,username,permalink,like_count,comment_count,status',
        access_token: token,
      };

      const response = await this.axiosInstance.get<InstagramMedia & { status?: string }>(
        `/${mediaId}`,
        { params },
      );

      return response;
    } catch (error) {
      this.logger.error(`【Instagram Adapter】获取媒体详情失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 6. 获取Instagram账号的媒体列表
   * @param limit 数量（默认20）
   * @param after 分页游标
   * @param accessToken 访问令牌
   * @returns 媒体列表
   */
  async getMediaList(
    limit: number = 20,
    after?: string,
    accessToken?: string,
  ): Promise<InstagramApiResponse<InstagramMedia[]>> {
    try {
      const accountId = this.instagramBusinessAccountId || (await this.getInstagramBusinessAccount(accessToken)).id;
      const token = accessToken || this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN');

      if (!accountId || !token) {
        throw new HttpException('缺少Instagram企业账号ID/访问令牌', HttpStatus.BAD_REQUEST);
      }

      const params: Record<string, any> = {
        fields: 'id,media_type,media_url,caption,timestamp,username,permalink,like_count,comment_count',
        limit,
        access_token: token,
      };

      if (after) params.after = after;

      const response = await this.axiosInstance.get<InstagramApiResponse<InstagramMedia[]>>(
        `/${accountId}/media`,
        { params },
      );

      return response;
    } catch (error) {
      this.logger.error(`【Instagram Adapter】获取媒体列表失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 7. 删除Instagram发布的内容
   * @param mediaId 媒体ID
   * @param accessToken 访问令牌
   * @returns 删除结果
   */
  async deleteMedia(mediaId: string, accessToken?: string): Promise<{ success: boolean }> {
    try {
      const token = accessToken || this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN');
      if (!token) {
        throw new HttpException('缺少Instagram访问令牌', HttpStatus.BAD_REQUEST);
      }

      const params = {
        access_token: token,
      };

      const response = await this.axiosInstance.delete<{ success: boolean }>(
        `/${mediaId}`,
        { params },
      );

      this.logger.log(`【Instagram Adapter】删除媒体成功：${mediaId}`);
      return { success: response.success };
    } catch (error) {
      this.logger.error(`【Instagram Adapter】删除媒体失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 8. 通用Instagram API调用方法（扩展用）
   * @param path API路径
   * @param config Axios配置
   * @returns API响应
   */
  async request<T = any>(
    path: string,
    config: AxiosRequestConfig = {},
  ): Promise<InstagramApiResponse<T>> {
    try {
      // 自动补充访问令牌
      if (!config.params?.access_token) {
        config.params = {
          ...config.params,
          access_token: this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN'),
        };
      }

      return await this.axiosInstance.request<InstagramApiResponse<T>>({
        url: path,
        ...config,
      });
    } catch (error) {
      this.logger.error(`【Instagram Adapter】通用请求失败：${(error as Error).message}`);
      throw error;
    }
  }
}