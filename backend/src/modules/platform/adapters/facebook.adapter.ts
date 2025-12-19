/**
 * Facebook平台适配器
 * 路径：platform/adapters/facebook.adapter.ts
 * 封装Facebook Graph API调用，适配NestJS依赖注入，与项目架构统一
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

/**
 * Facebook API响应通用类型
 */
type FacebookApiResponse<T = any> = {
  data: T;
  paging?: {
    next?: string;
    previous?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
};

/**
 * Facebook登录授权返回类型
 */
export type FacebookAuthResponse = {
  access_token: string;
  expires_in: number;
  user_id: string;
  email?: string;
  name?: string;
  picture?: {
    data: {
      url: string;
      width: number;
      height: number;
    };
  };
};

/**
 * Facebook内容发布参数类型
 */
export type FacebookPostParams = {
  message: string; // 发布内容文本
  link?: string; // 关联链接
  image_url?: string; // 图片URL
  video_url?: string; // 视频URL
  page_id?: string; // 发布到的页面ID（默认使用配置的页面）
  scheduled_publish_time?: number; // 定时发布时间（Unix时间戳）
};

/**
 * Facebook内容发布返回类型
 */
export type FacebookPostResponse = {
  id: string; // 发布内容ID
  post_id: string;
};

/**
 * Facebook适配器核心类
 */
@Injectable()
export class FacebookAdapter {
  private readonly logger = new Logger(FacebookAdapter.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://graph.facebook.com/v19.0'; // Facebook Graph API版本
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly defaultPageId: string;
  private readonly defaultPageAccessToken: string;

  constructor(private readonly configService: ConfigService) {
    // 从配置读取Facebook应用信息（适配.env配置）
    this.appId = this.configService.get<string>('FACEBOOK_APP_ID', '');
    this.appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET', '');
    this.defaultPageId = this.configService.get<string>('FACEBOOK_DEFAULT_PAGE_ID', '');
    this.defaultPageAccessToken = this.configService.get<string>(
      'FACEBOOK_DEFAULT_PAGE_ACCESS_TOKEN',
      '',
    );

    // 初始化Axios实例
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // 请求拦截器：统一处理请求参数
    this.axiosInstance.interceptors.request.use((config) => {
      this.logger.debug(`【Facebook API】请求：${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // 响应拦截器：统一处理响应/错误
    this.axiosInstance.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError) => {
        const response = error.response?.data as FacebookApiResponse;
        const errorMsg = response?.error?.message || error.message || 'Facebook API请求失败';
        const errorCode = response?.error?.code || error.response?.status || 500;
        
        this.logger.error(`【Facebook API】错误：${errorCode} → ${errorMsg}`);
        throw new HttpException(
          `Facebook平台错误：${errorMsg}`,
          errorCode === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY,
        );
      },
    );

    // 校验配置
    if (!this.appId || !this.appSecret) {
      this.logger.warn('【Facebook Adapter】未配置APP_ID/APP_SECRET，部分功能将不可用');
    }
  }

  /**
   * 1. 获取Facebook长期访问令牌（用于服务器端调用）
   * @param shortLivedToken 短期令牌（前端登录获取）
   * @returns 长期访问令牌
   */
  async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
    try {
      const params = {
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: shortLivedToken,
      };

      const response = await this.axiosInstance.get<{
        access_token: string;
        expires_in: number;
      }>('/oauth/access_token', { params });

      return {
        access_token: response.access_token,
        expires_in: response.expires_in,
      };
    } catch (error) {
      this.logger.error(`【Facebook Adapter】获取长期令牌失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 2. 验证Facebook登录令牌并获取用户信息
   * @param accessToken 前端传入的访问令牌
   * @returns 用户信息
   */
  async verifyAuthToken(accessToken: string): Promise<FacebookAuthResponse> {
    try {
      // 第一步：校验令牌有效性
      const debugParams = {
        input_token: accessToken,
        access_token: `${this.appId}|${this.appSecret}`, // 应用级令牌
      };
      const debugResponse = await this.axiosInstance.get<{
        data: {
          is_valid: boolean;
          user_id: string;
          app_id: string;
          expires_at: number;
        };
      }>('/debug_token', { params: debugParams });

      if (!debugResponse.data.is_valid) {
        throw new HttpException('Facebook令牌无效', HttpStatus.UNAUTHORIZED);
      }

      // 第二步：获取用户基本信息
      const userParams = {
        fields: 'id,name,email,picture',
        access_token: accessToken,
      };
      const userResponse = await this.axiosInstance.get<{
        id: string;
        name?: string;
        email?: string;
        picture?: {
          data: {
            url: string;
            width: number;
            height: number;
          };
        };
      }>(`/${debugResponse.data.user_id}`, { params: userParams });

      return {
        access_token: accessToken,
        expires_in: debugResponse.data.expires_at - Math.floor(Date.now() / 1000),
        user_id: userResponse.id,
        email: userResponse.email,
        name: userResponse.name,
        picture: userResponse.picture,
      };
    } catch (error) {
      this.logger.error(`【Facebook Adapter】验证登录令牌失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 3. 发布内容到Facebook（个人主页/公共主页）
   * @param params 发布参数
   * @param accessToken 访问令牌（默认使用配置的页面令牌）
   * @returns 发布结果
   */
  async publishPost(
    params: FacebookPostParams,
    accessToken?: string,
  ): Promise<FacebookPostResponse> {
    try {
      const pageId = params.page_id || this.defaultPageId;
      const token = accessToken || this.defaultPageAccessToken;

      if (!pageId || !token) {
        throw new HttpException('未配置Facebook页面ID/访问令牌', HttpStatus.BAD_REQUEST);
      }

      // 构建发布参数
      const postData: Record<string, any> = {
        message: params.message,
        access_token: token,
      };

      if (params.link) postData.link = params.link;
      if (params.image_url) postData.url = params.image_url; // 图片发布参数为url
      if (params.video_url) postData.video_url = params.video_url;
      if (params.scheduled_publish_time) {
        postData.scheduled_publish_time = params.scheduled_publish_time;
        postData.published = false; // 定时发布需设置为未发布
      }

      // 执行发布
      const response = await this.axiosInstance.post<FacebookPostResponse>(
        `/${pageId}/feed`,
        postData,
      );

      this.logger.log(`【Facebook Adapter】发布内容成功：${response.id}`);
      return response;
    } catch (error) {
      this.logger.error(`【Facebook Adapter】发布内容失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 4. 获取Facebook页面的内容列表
   * @param pageId 页面ID（默认使用配置的页面）
   * @param limit 每页数量
   * @param accessToken 访问令牌
   * @returns 内容列表
   */
  async getPagePosts(
    pageId?: string,
    limit: number = 20,
    accessToken?: string,
  ): Promise<FacebookApiResponse<{ id: string; message: string; created_time: string }[]>> {
    try {
      const targetPageId = pageId || this.defaultPageId;
      const token = accessToken || this.defaultPageAccessToken;

      if (!targetPageId || !token) {
        throw new HttpException('未配置Facebook页面ID/访问令牌', HttpStatus.BAD_REQUEST);
      }

      const params = {
        fields: 'id,message,created_time',
        limit,
        access_token: token,
      };

      const response = await this.axiosInstance.get<
        FacebookApiResponse<{ id: string; message: string; created_time: string }[]>
      >(`/${targetPageId}/posts`, { params });

      return response;
    } catch (error) {
      this.logger.error(`【Facebook Adapter】获取页面内容失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 5. 删除Facebook发布的内容
   * @param postId 内容ID
   * @param accessToken 访问令牌
   * @returns 删除结果
   */
  async deletePost(postId: string, accessToken?: string): Promise<{ success: boolean }> {
    try {
      const token = accessToken || this.defaultPageAccessToken;
      if (!token) {
        throw new HttpException('未配置Facebook访问令牌', HttpStatus.BAD_REQUEST);
      }

      const params = {
        access_token: token,
      };

      const response = await this.axiosInstance.delete<{ success: boolean }>(
        `/${postId}`,
        { params },
      );

      this.logger.log(`【Facebook Adapter】删除内容成功：${postId}`);
      return { success: response.success };
    } catch (error) {
      this.logger.error(`【Facebook Adapter】删除内容失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 6. 通用Facebook API调用方法（扩展用）
   * @param path API路径
   * @param config Axios配置
   * @returns API响应
   */
  async request<T = any>(
    path: string,
    config: AxiosRequestConfig = {},
  ): Promise<FacebookApiResponse<T>> {
    try {
      // 自动补充访问令牌（若未传）
      if (!config.params?.access_token && this.defaultPageAccessToken) {
        config.params = {
          ...config.params,
          access_token: this.defaultPageAccessToken,
        };
      }

      return await this.axiosInstance.request<FacebookApiResponse<T>>({
        url: path,
        ...config,
      });
    } catch (error) {
      this.logger.error(`【Facebook Adapter】通用请求失败：${(error as Error).message}`);
      throw error;
    }
  }
}