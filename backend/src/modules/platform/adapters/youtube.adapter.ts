/**
 * YouTube平台适配器
 * 路径：platform/adapters/youtube.adapter.ts
 * 基于YouTube Data API v3封装，支持视频发布、数据统计、评论管理等核心能力
 * 适配NestJS依赖注入，与项目现有架构统一
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

/**
 * YouTube API响应通用类型
 */
type YoutubeApiResponse<T = any> = {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: T[];
  error?: {
    code: number;
    message: string;
    errors: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
};

/**
 * YouTube视频上传参数类型
 */
export type YoutubeVideoUploadParams = {
  title: string; // 视频标题
  description: string; // 视频描述
  tags?: string[]; // 视频标签
  categoryId: string; // 视频分类ID（如10=音乐，22=娱乐）
  privacyStatus: 'public' | 'private' | 'unlisted'; // 隐私状态
  videoFilePath?: string; // 本地视频文件路径（优先）
  videoUrl?: string; // 远程视频URL（需支持直接下载）
  thumbnailFilePath?: string; // 本地封面图路径
  thumbnailUrl?: string; // 远程封面图URL
  scheduledPublishTime?: string; // 定时发布时间（ISO 8601格式，如2025-12-31T23:59:59Z）
  defaultLanguage?: string; // 默认语言（如zh-CN）
};

/**
 * YouTube视频信息类型
 */
export type YoutubeVideoInfo = {
  id: string;
  snippet: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    publishedAt: string;
    thumbnails: {
      default: { url: string; width: number; height: number };
      medium: { url: string; width: number; height: number };
      high: { url: string; width: number; height: number };
    };
    channelId: string;
    channelTitle: string;
  };
  status: {
    privacyStatus: 'public' | 'private' | 'unlisted';
    uploadStatus: 'uploaded' | 'processed' | 'failed' | 'rejected';
    publishAt?: string;
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    dislikeCount: string;
    commentCount: string;
    favoriteCount: string;
  };
};

/**
 * YouTube评论操作参数
 */
export type YoutubeCommentParams = {
  videoId: string; // 视频ID
  text: string; // 评论内容
  parentId?: string; // 回复的父评论ID（用于回复评论）
};

/**
 * YouTube适配器核心类
 */
@Injectable()
export class YoutubeAdapter {
  private readonly logger = new Logger(YoutubeAdapter.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly youtubeApiBaseUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly oauth2Client: OAuth2Client;
  private readonly apiKey: string; // 服务端API密钥（用于只读操作）
  private readonly clientId: string; // OAuth客户端ID
  private readonly clientSecret: string; // OAuth客户端密钥
  private readonly refreshToken: string; // 长期刷新令牌（用于获取访问令牌）
  private readonly channelId: string; // 默认上传频道ID

  constructor(private readonly configService: ConfigService) {
    // 从配置读取YouTube信息
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY', '');
    this.clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('YOUTUBE_CLIENT_SECRET', '');
    this.refreshToken = this.configService.get<string>('YOUTUBE_REFRESH_TOKEN', '');
    this.channelId = this.configService.get<string>('YOUTUBE_CHANNEL_ID', '');

    // 初始化OAuth2客户端
    this.oauth2Client = new OAuth2Client({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    // 设置长期刷新令牌
    this.oauth2Client.setCredentials({ refresh_token: this.refreshToken });

    // 初始化Axios实例
    this.axiosInstance = axios.create({
      baseURL: this.youtubeApiBaseUrl,
      timeout: 30000, // 视频上传超时时间延长至30秒
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // 请求拦截器：自动添加访问令牌
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // 只读操作使用API Key，写操作使用OAuth令牌
        if (['POST', 'PUT', 'DELETE'].includes(config.method?.toUpperCase() || '')) {
          const accessToken = await this.getAccessToken();
          config.headers['Authorization'] = `Bearer ${accessToken}`;
        } else if (!config.params?.key) {
          config.params = { ...config.params, key: this.apiKey };
        }

        this.logger.debug(`【YouTube API】请求：${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器：统一处理错误
    this.axiosInstance.interceptors.response.use(
      (response) => response.data,
      (error: AxiosError) => {
        const response = error.response?.data as YoutubeApiResponse;
        const errorMsg = response?.error?.message || error.message || 'YouTube API请求失败';
        const errorCode = response?.error?.code || error.response?.status || 500;

        this.logger.error(`【YouTube API】错误：${errorCode} → ${errorMsg}`);
        throw new HttpException(
          `YouTube平台错误：${errorMsg}`,
          errorCode === 401 ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_GATEWAY,
        );
      }
    );

    // 校验配置
    if (!this.apiKey) {
      this.logger.warn('【YouTube Adapter】未配置API_KEY，只读操作将不可用');
    }
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      this.logger.warn('【YouTube Adapter】未配置OAuth信息，写操作（上传/发布）将不可用');
    }
  }

  /**
   * 1. 获取YouTube访问令牌（自动刷新）
   * @returns 访问令牌
   */
  private async getAccessToken(): Promise<string> {
    try {
      const { token } = await this.oauth2Client.getAccessToken();
      if (!token) {
        throw new HttpException('获取YouTube访问令牌失败', HttpStatus.UNAUTHORIZED);
      }
      return token;
    } catch (error) {
      this.logger.error(`【YouTube Adapter】获取访问令牌失败：${(error as Error).message}`);
      throw new HttpException(
        `获取YouTube令牌失败：${(error as Error).message}`,
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * 2. 上传视频到YouTube（核心功能）
   * @param params 上传参数
   * @returns 视频信息
   */
  async uploadVideo(params: YoutubeVideoUploadParams): Promise<YoutubeVideoInfo> {
    try {
      if (!this.channelId) {
        throw new HttpException('未配置YouTube频道ID', HttpStatus.BAD_REQUEST);
      }

      // 步骤1：创建视频元数据
      const videoMetadata = {
        snippet: {
          title: params.title,
          description: params.description,
          tags: params.tags || [],
          categoryId: params.categoryId,
          defaultLanguage: params.defaultLanguage || 'zh-CN',
          channelId: this.channelId,
        },
        status: {
          privacyStatus: params.privacyStatus,
          publishAt: params.scheduledPublishTime,
          selfDeclaredMadeForKids: false, // 非儿童内容
        },
      };

      // 步骤2：处理视频文件（本地文件/远程URL）
      let videoData: Buffer | string;
      if (params.videoFilePath) {
        // 读取本地视频文件
        if (!fs.existsSync(params.videoFilePath)) {
          throw new HttpException(`视频文件不存在：${params.videoFilePath}`, HttpStatus.BAD_REQUEST);
        }
        videoData = fs.readFileSync(params.videoFilePath);
      } else if (params.videoUrl) {
        // 下载远程视频
        const videoResponse = await axios.get(params.videoUrl, { responseType: 'arraybuffer' });
        videoData = Buffer.from(videoResponse.data);
      } else {
        throw new HttpException('必须提供视频文件路径或远程URL', HttpStatus.BAD_REQUEST);
      }

      // 步骤3：使用Google API客户端上传视频（axios不适合大文件上传）
      const youtube = google.youtube({
        version: 'v3',
        auth: await this.getAccessToken(),
      });

      const uploadResponse = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: videoMetadata,
        media: {
          body: videoData,
        },
        notifySubscribers: true, // 通知订阅者
      });

      if (!uploadResponse.data.id) {
        throw new HttpException('视频上传失败，未返回视频ID', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.log(`【YouTube Adapter】视频上传成功：${uploadResponse.data.id}`);

      // 步骤4：上传封面图（若有）
      if (params.thumbnailFilePath || params.thumbnailUrl) {
        await this.uploadThumbnail(uploadResponse.data.id, params);
      }

      // 步骤5：获取完整视频信息
      return await this.getVideoInfo(uploadResponse.data.id);
    } catch (error) {
      this.logger.error(`【YouTube Adapter】上传视频失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 3. 上传视频封面图
   * @param videoId 视频ID
   * @param params 上传参数
   */
  private async uploadThumbnail(videoId: string, params: YoutubeVideoUploadParams): Promise<void> {
    try {
      let thumbnailData: Buffer;
      if (params.thumbnailFilePath) {
        if (!fs.existsSync(params.thumbnailFilePath)) {
          throw new HttpException(`封面文件不存在：${params.thumbnailFilePath}`, HttpStatus.BAD_REQUEST);
        }
        thumbnailData = fs.readFileSync(params.thumbnailFilePath);
      } else if (params.thumbnailUrl) {
        const thumbnailResponse = await axios.get(params.thumbnailUrl, { responseType: 'arraybuffer' });
        thumbnailData = Buffer.from(thumbnailResponse.data);
      } else {
        return;
      }

      const youtube = google.youtube({
        version: 'v3',
        auth: await this.getAccessToken(),
      });

      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: thumbnailData,
        },
      });

      this.logger.log(`【YouTube Adapter】封面上传成功：${videoId}`);
    } catch (error) {
      this.logger.warn(`【YouTube Adapter】封面上传失败：${(error as Error).message}`);
      // 封面上传失败不影响视频上传，仅警告
    }
  }

  /**
   * 4. 获取视频详情
   * @param videoId 视频ID
   * @returns 视频完整信息
   */
  async getVideoInfo(videoId: string): Promise<YoutubeVideoInfo> {
    try {
      const params = {
        part: 'snippet,status,statistics',
        id: videoId,
      };

      const response = await this.axiosInstance.get<YoutubeApiResponse<YoutubeVideoInfo>>(
        '/videos',
        { params }
      );

      if (!response.items || response.items.length === 0) {
        throw new HttpException(`视频不存在：${videoId}`, HttpStatus.NOT_FOUND);
      }

      return response.items[0];
    } catch (error) {
      this.logger.error(`【YouTube Adapter】获取视频信息失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 5. 获取频道视频列表
   * @param channelId 频道ID（默认使用配置的频道）
   * @param limit 每页数量（默认20）
   * @param pageToken 分页令牌
   * @returns 视频列表
   */
  async getChannelVideos(
    channelId?: string,
    limit: number = 20,
    pageToken?: string
  ): Promise<YoutubeApiResponse<YoutubeVideoInfo>> {
    try {
      const targetChannelId = channelId || this.channelId;
      if (!targetChannelId) {
        throw new HttpException('未配置YouTube频道ID', HttpStatus.BAD_REQUEST);
      }

      const params = {
        part: 'snippet,status,statistics',
        channelId: targetChannelId,
        maxResults: limit,
        pageToken: pageToken,
        order: 'date', // 按发布时间排序
        type: 'video',
      };

      const response = await this.axiosInstance.get<YoutubeApiResponse<YoutubeVideoInfo>>(
        '/search',
        { params }
      );

      return response;
    } catch (error) {
      this.logger.error(`【YouTube Adapter】获取频道视频失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 6. 更新视频信息（标题/描述/标签/隐私状态等）
   * @param videoId 视频ID
   * @param updateData 要更新的字段
   * @returns 更新后的视频信息
   */
  async updateVideo(
    videoId: string,
    updateData: Partial<YoutubeVideoUploadParams>
  ): Promise<YoutubeVideoInfo> {
    try {
      // 获取现有视频信息
      const existingVideo = await this.getVideoInfo(videoId);

      // 构建更新参数
      const updateParams = {
        id: videoId,
        snippet: {
          ...existingVideo.snippet,
          title: updateData.title || existingVideo.snippet.title,
          description: updateData.description || existingVideo.snippet.description,
          tags: updateData.tags || existingVideo.snippet.tags,
          categoryId: updateData.categoryId || existingVideo.snippet.categoryId,
        },
        status: {
          ...existingVideo.status,
          privacyStatus: updateData.privacyStatus || existingVideo.status.privacyStatus,
          publishAt: updateData.scheduledPublishTime || existingVideo.status.publishAt,
        },
      };

      const youtube = google.youtube({
        version: 'v3',
        auth: await this.getAccessToken(),
      });

      await youtube.videos.update({
        part: 'snippet,status',
        requestBody: updateParams,
      });

      this.logger.log(`【YouTube Adapter】更新视频成功：${videoId}`);
      return await this.getVideoInfo(videoId);
    } catch (error) {
      this.logger.error(`【YouTube Adapter】更新视频失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 7. 删除YouTube视频
   * @param videoId 视频ID
   * @returns 删除结果
   */
  async deleteVideo(videoId: string): Promise<{ success: boolean }> {
    try {
      const youtube = google.youtube({
        version: 'v3',
        auth: await this.getAccessToken(),
      });

      await youtube.videos.delete({
        id: videoId,
      });

      this.logger.log(`【YouTube Adapter】删除视频成功：${videoId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`【YouTube Adapter】删除视频失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 8. 发布评论到YouTube视频
   * @param params 评论参数
   * @returns 评论ID
   */
  async postComment(params: YoutubeCommentParams): Promise<{ commentId: string }> {
    try {
      const commentData = {
        snippet: {
          videoId: params.videoId,
          topLevelComment: {
            snippet: {
              textOriginal: params.text,
            },
          },
          parentId: params.parentId,
        },
      };

      const response = await this.axiosInstance.post<YoutubeApiResponse<{ id: string }>>(
        '/commentThreads',
        commentData,
        { params: { part: 'snippet' } }
      );

      if (!response.items || response.items.length === 0) {
        throw new HttpException('发布评论失败', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.log(`【YouTube Adapter】发布评论成功：${response.items[0].id}`);
      return { commentId: response.items[0].id };
    } catch (error) {
      this.logger.error(`【YouTube Adapter】发布评论失败：${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 9. 通用YouTube API调用方法（扩展用）
   * @param path API路径
   * @param config Axios配置
   * @returns API响应
   */
  async request<T = any>(
    path: string,
    config: AxiosRequestConfig = {}
  ): Promise<YoutubeApiResponse<T>> {
    try {
      return await this.axiosInstance.request<YoutubeApiResponse<T>>({
        url: path,
        ...config,
      });
    } catch (error) {
      this.logger.error(`【YouTube Adapter】通用请求失败：${(error as Error).message}`);
      throw error;
    }
  }
}