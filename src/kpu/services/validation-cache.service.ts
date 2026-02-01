// src/kpu/services/validation-cache.service.ts
/**
 * 验证结果缓存服务
 * 
 * 用于缓存验证结果，提升性能
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { SnippetValidationResult, OutputValidationResult } from '../types/validation.types';
import { KPUMonitoringService } from './kpu-monitoring.service';
import * as crypto from 'crypto';

@Injectable()
export class ValidationCacheService {
  private readonly logger = new Logger(ValidationCacheService.name);
  private readonly TTL = 3600; // 1小时
  private readonly memoryCache = new Map<string, { result: any; expiresAt: number }>();

  constructor(
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly monitoringService?: KPUMonitoringService,
  ) {}

  /**
   * 生成内容哈希（用于缓存键）
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 获取缓存的片段验证结果
   */
  async getCachedSnippetValidation(content: string): Promise<SnippetValidationResult | null> {
    const hash = this.hashContent(content);
    const key = `kpu:snippet:${hash}`;

    // 1. 先检查内存缓存
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && memoryCached.expiresAt > Date.now()) {
      this.logger.debug(`从内存缓存获取片段验证结果: ${hash}`);
      if (this.monitoringService) {
        this.monitoringService.recordCacheHit();
      }
      return memoryCached.result;
    }

    // 2. 检查Redis缓存
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(key);
        if (cached && typeof cached === 'string') {
          const result = JSON.parse(cached);
          // 同时更新内存缓存
          this.memoryCache.set(key, {
            result,
            expiresAt: Date.now() + this.TTL * 1000,
          });
          this.logger.debug(`从Redis缓存获取片段验证结果: ${hash}`);
          if (this.monitoringService) {
            this.monitoringService.recordCacheHit();
          }
          return result;
        }
      } catch (error: any) {
        this.logger.warn(`Redis缓存读取失败: ${error?.message}`);
      }
    }

    if (this.monitoringService) {
      this.monitoringService.recordCacheMiss();
    }
    return null;
  }

  /**
   * 缓存片段验证结果
   */
  async cacheSnippetValidation(content: string, result: SnippetValidationResult): Promise<void> {
    const hash = this.hashContent(content);
    const key = `kpu:snippet:${hash}`;

    // 1. 更新内存缓存
    this.memoryCache.set(key, {
      result,
      expiresAt: Date.now() + this.TTL * 1000,
    });

    // 2. 更新Redis缓存
    if (this.redisService) {
      try {
        await this.redisService.set(key, JSON.stringify(result), this.TTL);
      } catch (error: any) {
        this.logger.warn(`Redis缓存写入失败: ${error?.message}`);
      }
    }

    // 3. 清理过期的内存缓存（定期清理）
    if (this.memoryCache.size > 1000) {
      this.cleanExpiredMemoryCache();
    }
  }

  /**
   * 获取缓存的输出验证结果
   */
  async getCachedOutputValidation(output: string): Promise<OutputValidationResult | null> {
    const hash = this.hashContent(output);
    const key = `kpu:output:${hash}`;

    // 1. 先检查内存缓存
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && memoryCached.expiresAt > Date.now()) {
      this.logger.debug(`从内存缓存获取输出验证结果: ${hash}`);
      if (this.monitoringService) {
        this.monitoringService.recordCacheHit();
      }
      return memoryCached.result;
    }

    // 2. 检查Redis缓存
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(key);
        if (cached && typeof cached === 'string') {
          const result = JSON.parse(cached);
          // 同时更新内存缓存
          this.memoryCache.set(key, {
            result,
            expiresAt: Date.now() + this.TTL * 1000,
          });
          this.logger.debug(`从Redis缓存获取输出验证结果: ${hash}`);
          if (this.monitoringService) {
            this.monitoringService.recordCacheHit();
          }
          return result;
        }
      } catch (error: any) {
        this.logger.warn(`Redis缓存读取失败: ${error?.message}`);
      }
    }

    if (this.monitoringService) {
      this.monitoringService.recordCacheMiss();
    }
    return null;
  }

  /**
   * 缓存输出验证结果
   */
  async cacheOutputValidation(output: string, result: OutputValidationResult): Promise<void> {
    const hash = this.hashContent(output);
    const key = `kpu:output:${hash}`;

    // 1. 更新内存缓存
    this.memoryCache.set(key, {
      result,
      expiresAt: Date.now() + this.TTL * 1000,
    });

    // 2. 更新Redis缓存
    if (this.redisService) {
      try {
        await this.redisService.set(key, JSON.stringify(result), this.TTL);
      } catch (error: any) {
        this.logger.warn(`Redis缓存写入失败: ${error?.message}`);
      }
    }

    // 3. 清理过期的内存缓存
    if (this.memoryCache.size > 1000) {
      this.cleanExpiredMemoryCache();
    }
  }

  /**
   * 清理过期的内存缓存
   */
  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expiresAt <= now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`清理了 ${cleaned} 个过期的内存缓存项`);
    }
  }

  /**
   * 清除所有缓存
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    // RedisService没有keys方法，暂时只清除内存缓存
    // 如果需要清除Redis缓存，需要直接操作Redis客户端
    this.logger.debug('已清除内存缓存（Redis缓存需要直接操作Redis客户端清除）');
  }
}
