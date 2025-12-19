/**
 * 社交账号实体
 * 路径：platform/entities/social-account.entity.ts
 * 存储各社交平台授权账号信息，适配TypeORM/Supabase，支持软删除、索引优化
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { PlatformType } from '../dto/connect-platform.dto';
import { encrypt, decrypt } from 'src/common/utils/crypto.util'; // 加密工具（需自行实现）

/**
 * 社交账号状态枚举
 */
export enum SocialAccountStatus {
  ACTIVE = 'active', // 有效
  EXPIRED = 'expired', // 令牌过期
  INVALID = 'invalid', // 令牌无效/授权撤销
  DISABLED = 'disabled', // 手动禁用
}

/**
 * 社交账号实体（TypeORM）
 */
@Entity('social_accounts') // 数据库表名
export class SocialAccountEntity {
  /**
   * 主键ID（UUID）
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 关联的系统用户ID
   * 索引：加速按用户查询账号
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 64, comment: '系统用户ID' })
  userId: string;

  /**
   * 平台类型
   * 索引：加速按平台查询账号
   */
  @Index()
  @Column({
    name: 'platform',
    type: 'enum',
    enum: PlatformType,
    comment: '平台类型：facebook/instagram/youtube/linkedin等',
  })
  platform: PlatformType;

  /**
   * 平台侧账号ID（如Facebook用户ID、LinkedIn公司ID）
   * 索引：(platform, account_id) 唯一索引，避免同一用户重复绑定同一平台账号
   */
  @Index(['platform', 'accountId'], { unique: true })
  @Column({ name: 'account_id', type: 'varchar', length: 128, comment: '平台账号ID' })
  accountId: string;

  /**
   * 平台账号名称（如Facebook昵称、LinkedIn公司名称）
   */
  @Column({ name: 'account_name', type: 'varchar', length: 255, comment: '平台账号名称' })
  accountName: string;

  /**
   * 访问令牌（加密存储）
   */
  @Column({ name: 'access_token', type: 'text', comment: '访问令牌（加密）' })
  accessToken: string;

  /**
   * 令牌过期时间（时间戳，单位秒）
   */
  @Column({ name: 'expires_in', type: 'bigint', comment: '令牌过期时间戳（秒）' })
  expiresIn: string;

  /**
   * 刷新令牌（加密存储，可选）
   */
  @Column({
    name: 'refresh_token',
    type: 'text',
    nullable: true,
    comment: '刷新令牌（加密，可选）',
  })
  refreshToken?: string;

  /**
   * 刷新令牌过期时间（时间戳，单位秒，可选）
   */
  @Column({
    name: 'refresh_token_expires_in',
    type: 'bigint',
    nullable: true,
    comment: '刷新令牌过期时间戳（秒）',
  })
  refreshTokenExpiresIn?: string;

  /**
   * 授权范围（如facebook:email,public_profile）
   */
  @Column({ name: 'scope', type: 'varchar', length: 512, comment: '授权范围' })
  scope: string;

  /**
   * 用户自定义昵称（用于标识该账号）
   */
  @Column({
    name: 'nickname',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '自定义昵称',
  })
  nickname?: string;

  /**
   * 账号状态
   */
  @Column({
    name: 'status',
    type: 'enum',
    enum: SocialAccountStatus,
    default: SocialAccountStatus.ACTIVE,
    comment: '账号状态：active/expired/invalid/disabled',
  })
  status: SocialAccountStatus;

  /**
   * 扩展字段（存储平台特有信息，如Facebook页面ID、YouTube频道ID）
   */
  @Column({
    name: 'extend',
    type: 'jsonb', // Supabase/PostgreSQL使用jsonb，MySQL使用json
    nullable: true,
    comment: '扩展字段（JSON）',
  })
  extend?: Record<string, any>;

  /**
   * 软删除时间
   */
  @Column({
    name: 'delete_at',
    type: 'timestamp',
    nullable: true,
    comment: '软删除时间',
  })
  deleteAt?: Date;

  /**
   * 创建时间
   */
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: '创建时间',
  })
  createdAt: Date;

  /**
   * 更新时间
   */
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
    comment: '更新时间',
  })
  updatedAt: Date;

  // ------------------------------ 钩子方法 ------------------------------
  /**
   * 插入前钩子：加密令牌
   */
  @BeforeInsert()
  encryptBeforeInsert() {
    this.accessToken = encrypt(this.accessToken); // 加密访问令牌
    if (this.refreshToken) {
      this.refreshToken = encrypt(this.refreshToken); // 加密刷新令牌
    }
    // 自动计算令牌状态（插入时校验是否已过期）
    this.checkTokenExpired();
  }

  /**
   * 更新前钩子：加密令牌（仅当令牌变更时）
   */
  @BeforeUpdate()
  encryptBeforeUpdate() {
    // 仅当令牌字段有修改时加密（避免重复加密）
    if (this.accessToken && !this.accessToken.startsWith('encrypted:')) {
      this.accessToken = encrypt(this.accessToken);
    }
    if (this.refreshToken && !this.refreshToken.startsWith('encrypted:')) {
      this.refreshToken = encrypt(this.refreshToken);
    }
    // 更新时校验令牌状态
    this.checkTokenExpired();
  }

  // ------------------------------ 辅助方法 ------------------------------
  /**
   * 校验令牌是否过期
   */
  checkTokenExpired() {
    const currentTime = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
    if (Number(this.expiresIn) < currentTime) {
      this.status = SocialAccountStatus.EXPIRED;
    }
  }

  /**
   * 获取解密后的访问令牌
   */
  getDecryptedAccessToken(): string {
    return decrypt(this.accessToken);
  }

  /**
   * 获取解密后的刷新令牌
   */
  getDecryptedRefreshToken(): string | undefined {
    return this.refreshToken ? decrypt(this.refreshToken) : undefined;
  }

  /**
   * 检查账号是否有效（状态active且令牌未过期）
   */
  isActive(): boolean {
    this.checkTokenExpired(); // 先更新状态
    return this.status === SocialAccountStatus.ACTIVE;
  }
}

/**
 * 加密工具示例（src/common/utils/crypto.util.ts）
 * 实际项目中建议使用环境变量配置密钥，此处为简化示例
 */
// export function encrypt(text: string): string {
//   const secretKey = process.env.CRYPTO_SECRET_KEY || 'your-secret-key-32bytes-long';
//   const iv = crypto.randomBytes(16);
//   const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
//   let encrypted = cipher.update(text);
//   encrypted = Buffer.concat([encrypted, cipher.final()]);
//   return `encrypted:${iv.toString('hex')}:${encrypted.toString('hex')}`;
// }

// export function decrypt(text: string): string {
//   if (!text.startsWith('encrypted:')) return text;
//   const secretKey = process.env.CRYPTO_SECRET_KEY || 'your-secret-key-32bytes-long';
//   const [, ivHex, encryptedHex] = text.split(':');
//   const iv = Buffer.from(ivHex, 'hex');
//   const encrypted = Buffer.from(encryptedHex, 'hex');
//   const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
//   let decrypted = decipher.update(encrypted);
//   decrypted = Buffer.concat([decrypted, decipher.final()]);
//   return decrypted.toString();
// }