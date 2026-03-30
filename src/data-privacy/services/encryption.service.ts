// src/data-privacy/services/encryption.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EncryptedData } from '../interfaces/data-privacy.interface';

/**
 * 加密服务
 * 
 * 提供数据加密和解密功能
 * 使用 AES-256-GCM 算法
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 64;
  private readonly tagLength = 16;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 获取加密密钥
   */
  private getEncryptionKey(): Buffer {
    // 从环境变量获取密钥，如果没有则使用默认密钥（仅用于开发）
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    
    if (!key) {
      this.logger.warn('ENCRYPTION_KEY not set, using default key (NOT FOR PRODUCTION)');
      // 默认密钥（仅用于开发环境）
      return crypto.scryptSync('default-key-not-for-production', 'salt', this.keyLength);
    }
    
    return Buffer.from(key, 'hex');
  }

  /**
   * 获取密钥ID
   */
  getKeyId(): string {
    return this.configService.get<string>('ENCRYPTION_KEY_ID', 'default-key-id');
  }

  /**
   * 加密数据
   */
  async encrypt(data: any, algorithm: string = 'AES-256'): Promise<EncryptedData> {
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.ivLength);
      const salt = crypto.randomBytes(this.saltLength);

      // 将数据转换为字符串
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);

      // 创建加密器
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // 加密数据
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 获取认证标签
      const authTag = cipher.getAuthTag();

      // 组合加密结果：salt + iv + authTag + encrypted
      const combined = Buffer.concat([
        salt,
        iv,
        authTag,
        Buffer.from(encrypted, 'hex'),
      ]);

      return {
        encrypted: combined.toString('base64'),
        encryptionKeyId: this.getKeyId(),
        encryptedAt: new Date(),
        algorithm,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Encryption failed: ${err.message}`, err.stack);
      throw new Error(`Failed to encrypt data: ${err.message}`);
    }
  }

  /**
   * 解密数据
   */
  async decrypt(encryptedData: EncryptedData): Promise<any> {
    try {
      const key = this.getEncryptionKey();
      const combined = Buffer.from(encryptedData.encrypted, 'base64');

      // 提取各个部分
      const _salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const authTag = combined.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength,
      );
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);

      // 创建解密器
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      // 解密数据
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      // 尝试解析为 JSON，如果失败则返回字符串
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Decryption failed: ${err.message}`, err.stack);
      throw new Error(`Failed to decrypt data: ${err.message}`);
    }
  }

  /**
   * 哈希数据（单向加密）
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
