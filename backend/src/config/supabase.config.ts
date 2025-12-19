import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StorageOptions } from '@supabase/storage-js';

/**
 * Supabase 模块枚举
 * 约束常用的Supabase功能模块，便于权限控制
 */
export enum SupabaseModule {
  AUTH = 'auth', // 认证模块
  STORAGE = 'storage', // 存储模块（文件上传）
  DATABASE = 'database', // 数据库模块
  REAL_TIME = 'real_time', // 实时订阅模块
}

/**
 * Supabase 存储桶配置接口
 * 适配内容库文件上传场景
 */
export interface SupabaseBucketConfig {
  name: string; // 存储桶名称
  public: boolean; // 是否公共可读
  allowedMimeTypes: string[]; // 允许上传的文件类型
  maxFileSize: number; // 最大文件大小（字节）
}

/**
 * Supabase 统一配置类
 * 封装客户端实例+配置，全局可注入
 */
@Injectable()
export class SupabaseConfig {
  private readonly supabaseClient: SupabaseClient;
  private readonly config: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string; // 高权限密钥（仅后端使用，禁止前端暴露）
    storage: Record<'content' | 'avatar', SupabaseBucketConfig>; // 存储桶配置
    realTimeChannel: string; // 实时订阅通道名
  };

  constructor(private readonly configService: ConfigService) {
    // 初始化并校验核心配置
    this.config = this.validateAndBuildConfig();
    // 创建全局Supabase客户端实例
    this.supabaseClient = this.createSupabaseClient();
  }

  /**
   * 校验并构建Supabase配置
   * 缺失核心配置直接抛错，避免运行时异常
   */
  private validateAndBuildConfig() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // 核心配置校验
    if (!url) throw new Error('SUPABASE_URL is required in environment variables');
    if (!anonKey) throw new Error('SUPABASE_ANON_KEY is required in environment variables');

    return {
      url,
      anonKey,
      serviceRoleKey,
      // 存储桶配置（贴合内容库/头像上传场景）
      storage: {
        content: {
          name: this.configService.get<string>('SUPABASE_BUCKET_CONTENT', 'content-library'),
          public: false, // 内容库文件仅授权用户可读
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'text/plain', 'application/json'],
          maxFileSize: this.configService.get<number>('SUPABASE_MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB
        },
        avatar: {
          name: this.configService.get<string>('SUPABASE_BUCKET_AVATAR', 'user-avatars'),
          public: true, // 头像公共可读
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maxFileSize: this.configService.get<number>('SUPABASE_AVATAR_MAX_SIZE', 2 * 1024 * 1024), // 2MB
        },
      },
      // 实时订阅通道（排程状态变更通知）
      realTimeChannel: this.configService.get<string>('SUPABASE_REAL_TIME_CHANNEL', 'schedule-updates'),
    };
  }

  /**
   * 创建Supabase客户端实例
   * 区分普通权限/高权限（Service Role）
   * @param useServiceRole 是否使用高权限密钥（仅后端敏感操作使用）
   */
  private createSupabaseClient(useServiceRole = false): SupabaseClient {
    const key = useServiceRole && this.config.serviceRoleKey ? this.config.serviceRoleKey : this.config.anonKey;
    
    // 存储配置（适配文件上传）
    const storageOptions: StorageOptions = {
      retryAttempts: 3, // 上传重试次数
      retryDelay: 1000, // 重试间隔
    };

    return createClient(this.config.url, key, {
      auth: {
        persistSession: false, // 后端无需持久化会话
        autoRefreshToken: false, // 禁用自动刷新Token（后端手动管理）
      },
      storage: storageOptions,
      realtime: {
        params: {
          eventsPerSecond: 10, // 限流，避免高频推送
        },
      },
    });
  }

  /**
   * 获取普通权限Supabase客户端（默认）
   * 适用于大部分业务操作（查询/普通上传）
   */
  getClient(): SupabaseClient {
    return this.supabaseClient;
  }

  /**
   * 获取高权限Supabase客户端（Service Role）
   * 仅用于后端敏感操作（如批量数据修改/权限配置）
   */
  getAdminClient(): SupabaseClient {
    if (!this.config.serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured (required for admin operations)');
    }
    return this.createSupabaseClient(true);
  }

  /**
   * 获取指定存储桶配置
   * @param bucketType 存储桶类型（content/avatar）
   */
  getBucketConfig(bucketType: 'content' | 'avatar'): SupabaseBucketConfig {
    return this.config.storage[bucketType];
  }

  /**
   * 获取实时订阅通道名
   */
  getRealTimeChannel(): string {
    return this.config.realTimeChannel;
  }

  /**
   * 生成存储桶文件访问签名URL
   * 适配前端文件上传/访问（带过期时间）
   * @param bucketType 存储桶类型
   * @param filePath 文件路径
   * @param expiresIn 过期时间（秒，默认300秒）
   */
  async generateSignedUrl(
    bucketType: 'content' | 'avatar',
    filePath: string,
    expiresIn = 300,
  ): Promise<string> {
    const bucketConfig = this.getBucketConfig(bucketType);
    const supabase = this.getAdminClient(); // 高权限生成签名URL

    const { data, error } = await supabase.storage
      .from(bucketConfig.name)
      .createSignedUrl(filePath, expiresIn);

    if (error) throw new Error(`Failed to generate signed URL: ${error.message}`);
    return data.signedUrl;
  }
}

/**
 * Supabase配置注册函数
 * 供Nest模块导入，实现依赖注入
 */
export const registerSupabaseConfig = () => ({
  provide: SupabaseConfig,
  useFactory: (configService: ConfigService) => new SupabaseConfig(configService),
  inject: [ConfigService],
});