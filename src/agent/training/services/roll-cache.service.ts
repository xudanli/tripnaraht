// src/agent/training/services/roll-cache.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 缓存项
 */
interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

/**
 * RollCacheService
 *
 * 职责：提供结果缓存机制，减少重复计算
 */
@Injectable()
export class RollCacheService {
  private readonly logger = new Logger(RollCacheService.name);
  private readonly cache: Map<string, CacheItem<any>> = new Map();
  private readonly defaultTTL: number;
  private readonly maxSize: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultTTL = parseInt(
      this.configService.get<string>('ROLL_CACHE_TTL') || '300000', // 5分钟
      10,
    );
    this.maxSize = parseInt(
      this.configService.get<string>('ROLL_CACHE_MAX_SIZE') || '1000',
      10,
    );

    // 定期清理过期缓存
    setInterval(() => this.cleanExpired(), 60000); // 每分钟清理一次
  }

  /**
   * 生成缓存键
   */
  private generateKey(prefix: string, key: string): string {
    return `${prefix}:${key}`;
  }

  /**
   * 获取缓存值
   */
  get<T>(prefix: string, key: string): T | null {
    const cacheKey = this.generateKey(prefix, key);
    const item = this.cache.get(cacheKey);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    return item.value as T;
  }

  /**
   * 设置缓存值
   */
  set<T>(prefix: string, key: string, value: T, ttl?: number): void {
    const cacheKey = this.generateKey(prefix, key);
    const expiresAt = Date.now() + (ttl || this.defaultTTL);

    // 如果缓存已满，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(cacheKey, { value, expiresAt });
  }

  /**
   * 删除缓存项
   */
  delete(prefix: string, key: string): void {
    const cacheKey = this.generateKey(prefix, key);
    this.cache.delete(cacheKey);
  }

  /**
   * 清空缓存
   */
  clear(prefix?: string): void {
    if (prefix) {
      // 只清空指定前缀的缓存
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${prefix}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => this.cache.delete(key));
    } else {
      // 清空所有缓存
      this.cache.clear();
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      this.logger.debug(
        `[RollCache] 清理了 ${keysToDelete.length} 个过期缓存项`,
      );
    }
  }

  /**
   * 删除最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestExpiresAt = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < oldestExpiresAt) {
        oldestExpiresAt = item.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`[RollCache] 删除最旧缓存项: ${oldestKey}`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}
