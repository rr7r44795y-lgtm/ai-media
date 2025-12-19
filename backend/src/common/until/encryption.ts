/**
 * 加密解密工具类
 * 包含：密码哈希、对称加密(AES)、随机字符串生成、JWT辅助等
 * 基于Node.js内置crypto模块，无需额外依赖
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { AppConfig } from '../../config/app.config';

/**
 * AES加密配置（可通过环境变量覆盖）
 */
interface AesConfig {
  algorithm: string; // 加密算法
  key: string; // 加密密钥（32位/16位，对应AES-256/AES-128）
  ivLength: number; // IV向量长度（16位）
}

/**
 * 哈希算法类型
 */
type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512';

/**
 * 加密工具类
 */
export class EncryptionUtil {
  private readonly aesConfig: AesConfig;
  private readonly appConfig: AppConfig;

  constructor(appConfig: AppConfig) {
    this.appConfig = appConfig;
    // 初始化AES配置（优先从环境变量读取，兜底使用默认值）
    this.aesConfig = {
      algorithm: this.appConfig.get('AES_ALGORITHM', 'aes-256-cbc'),
      key: this.appConfig.get('AES_KEY', this.generateSecureKey(32)), // 32位密钥（AES-256）
      ivLength: 16, // AES-CBC模式固定IV长度为16
    };

    // 生产环境校验密钥长度
    if (this.appConfig.isProd) {
      this.validateAesKey();
    }
  }

  /**
   * 生成安全随机密钥（用于AES/哈希盐值）
   * @param length 密钥长度（默认32位）
   * @returns 十六进制随机密钥
   */
  generateSecureKey(length: number = 32): string {
    return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * 密码哈希（带盐值，不可逆）
   * @param password 原始密码
   * @param salt 盐值（不传则自动生成）
   * @param algorithm 哈希算法（默认sha256）
   * @returns { hash: 哈希值, salt: 盐值 }
   * @example hashPassword('123456') → { hash: 'xxx', salt: 'yyy' }
   */
  hashPassword(
    password: string,
    salt?: string,
    algorithm: HashAlgorithm = 'sha256'
  ): { hash: string; salt: string } {
    // 自动生成盐值（16位）
    const finalSalt = salt || this.generateSecureKey(16);
    // 结合盐值哈希
    const hash = createHash(algorithm)
      .update(password + finalSalt)
      .digest('hex');
    return { hash, salt: finalSalt };
  }

  /**
   * 验证密码哈希
   * @param password 待验证密码
   * @param hash 已存储的哈希值
   * @param salt 已存储的盐值
   * @param algorithm 哈希算法（默认sha256）
   * @returns 是否匹配
   */
  verifyPassword(
    password: string,
    hash: string,
    salt: string,
    algorithm: HashAlgorithm = 'sha256'
  ): boolean {
    const { hash: verifyHash } = this.hashPassword(password, salt, algorithm);
    return verifyHash === hash;
  }

  /**
   * AES对称加密（CBC模式）
   * @param data 待加密数据（字符串/对象）
   * @returns 加密结果（base64格式，包含IV）
   * @example encryptAes({ name: 'test' }) → 'IV:加密数据'
   */
  encryptAes(data: string | object): string {
    // 统一转换为字符串
    const plainText = typeof data === 'object' ? JSON.stringify(data) : data;
    // 生成随机IV向量
    const iv = randomBytes(this.aesConfig.ivLength);
    // 创建加密器
    const cipher = createCipheriv(
      this.aesConfig.algorithm,
      Buffer.from(this.aesConfig.key),
      iv
    );
    // 加密
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    // IV和加密数据拼接（解密时需要IV）
    return `${iv.toString('base64')}:${encrypted}`;
  }

  /**
   * AES对称解密（CBC模式）
   * @param encryptedData 加密数据（格式：IV:加密数据）
   * @returns 解密后的数据（原始类型）
   * @example decryptAes('IV:加密数据') → { name: 'test' }
   */
  decryptAes(encryptedData: string): string | object {
    try {
      // 拆分IV和加密数据
      const [ivBase64, encryptedBase64] = encryptedData.split(':');
      if (!ivBase64 || !encryptedBase64) {
        throw new Error('无效的加密数据格式');
      }
      // 解析IV和密钥
      const iv = Buffer.from(ivBase64, 'base64');
      const key = Buffer.from(this.aesConfig.key);
      // 创建解密器
      const decipher = createDecipheriv(this.aesConfig.algorithm, key, iv);
      // 解密
      let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      // 尝试解析为JSON对象（失败则返回字符串）
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '解密失败';
      throw new Error(`AES解密错误: ${errMsg}`);
    }
  }

  /**
   * 生成BCrypt风格的哈希（可选，需安装bcrypt）
   * @param password 原始密码
   * @param rounds 加密轮数（默认10）
   * @returns 哈希值
   */
  async hashBcrypt(password: string, rounds: number = 10): Promise<string> {
    if (!this.appConfig.isProd) {
      // 开发环境跳过bcrypt安装检查
      const bcrypt = await import('bcrypt');
      return bcrypt.hash(password, rounds);
    }
    // 生产环境强制检查依赖
    try {
      const bcrypt = await import('bcrypt');
      return bcrypt.hash(password, rounds);
    } catch {
      throw new Error('请安装bcrypt依赖: npm install bcrypt @types/bcrypt');
    }
  }

  /**
   * 验证BCrypt哈希
   * @param password 待验证密码
   * @param hash 已存储的哈希值
   * @returns 是否匹配
   */
  async verifyBcrypt(password: string, hash: string): Promise<boolean> {
    try {
      const bcrypt = await import('bcrypt');
      return bcrypt.compare(password, hash);
    } catch {
      throw new Error('请安装bcrypt依赖: npm install bcrypt @types/bcrypt');
    }
  }

  /**
   * 生成HMAC签名
   * @param data 待签名数据
   * @param secret 签名密钥
   * @param algorithm 算法（默认sha256）
   * @returns 签名结果（十六进制）
   */
  generateHmac(
    data: string | object,
    secret: string,
    algorithm: HashAlgorithm = 'sha256'
  ): string {
    const plainText = typeof data === 'object' ? JSON.stringify(data) : data;
    return createHash(algorithm)
      .update(plainText + secret)
      .digest('hex');
  }

  /**
   * 验证HMAC签名
   * @param data 原始数据
   * @param signature 待验证签名
   * @param secret 签名密钥
   * @param algorithm 算法（默认sha256）
   * @returns 是否匹配
   */
  verifyHmac(
    data: string | object,
    signature: string,
    secret: string,
    algorithm: HashAlgorithm = 'sha256'
  ): boolean {
    const generated = this.generateHmac(data, secret, algorithm);
    return generated === signature;
  }

  /**
   * 校验AES密钥长度（生产环境强制校验）
   */
  private validateAesKey(): void {
    const keyLength = this.aesConfig.key.length;
    const algorithm = this.aesConfig.algorithm.toLowerCase();
    
    // AES-256 需要32位密钥，AES-128需要16位
    const requiredLength = algorithm.includes('256') ? 32 : 16;
    if (keyLength !== requiredLength) {
      throw new Error(
        `AES密钥长度错误: ${algorithm}需要${requiredLength}位，当前${keyLength}位`
      );
    }
  }
}

/**
 * 全局加密工具实例（需结合AppConfig使用）
 * 用法：const encryptionUtil = new EncryptionUtil(appConfig);
 */
export let encryptionUtil: EncryptionUtil;

/**
 * 初始化加密工具（在应用启动时调用）
 * @param appConfig AppConfig实例
 */
export function initEncryptionUtil(appConfig: AppConfig): void {
  encryptionUtil = new EncryptionUtil(appConfig);
}