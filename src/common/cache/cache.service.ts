// src/common/cache/cache.service.ts

/**
 * 通用缓存服务
 * 
 * 职责:
 * - 提供统一的缓存操作接口
 * - 支持Redis缓存（如果可用）
 * - 优雅降级到内存缓存（如果Redis不可用）
 * 
 * 参考文档:
 * - API_REDESIGN_CODE_TEMPLATES.md - 代码模板
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  // 内存缓存降级（当Redis不可用时使用）
  private memoryCache = new Map<string, { data: any; expiry: number }>();

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {
    if (this.redisService) {
      this.logger.log('✅ 缓存服务已启用（Redis）');
    } else {
      this.logger.warn('⚠️ Redis服务不可用，使用内存缓存（重启后数据会丢失）');
    }
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // 优先使用Redis
      if (this.redisService) {
        const value = await this.redisService.get<T>(key);
        if (value !== undefined && value !== null) {
          return value;
        }
      }

      // 降级到内存缓存
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && Date.now() < memoryEntry.expiry) {
        return memoryEntry.data as T;
      } else if (memoryEntry) {
        // 已过期，删除
        this.memoryCache.delete(key);
      }

      return null;
    } catch (error: any) {
      this.logger.warn(`缓存获取失败: key=${key}, error=${error.message}`);
      
      // 尝试从内存缓存获取
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && Date.now() < memoryEntry.expiry) {
        return memoryEntry.data as T;
      }

      return null;
    }
  }

  /**
   * 设置缓存值
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      // 优先使用Redis
      if (this.redisService) {
        await this.redisService.set(key, value, ttl);
      }

      // 同时存储到内存缓存（作为备份）
      const expiry = Date.now() + ttl * 1000;
      this.memoryCache.set(key, { data: value, expiry });

      // 清理过期项（定期清理，避免内存泄漏）
      this.cleanupExpiredEntries();
    } catch (error: any) {
      this.logger.warn(`缓存设置失败: key=${key}, error=${error.message}`);
      
      // 降级到内存缓存
      const expiry = Date.now() + ttl * 1000;
      this.memoryCache.set(key, { data: value, expiry });
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    try {
      // 删除Redis缓存
      if (this.redisService) {
        await this.redisService.del(key);
      }

      // 删除内存缓存
      this.memoryCache.delete(key);
    } catch (error: any) {
      this.logger.warn(`缓存删除失败: key=${key}, error=${error.message}`);
      // 至少删除内存缓存
      this.memoryCache.delete(key);
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.redisService) {
        return await this.redisService.exists(key);
      }

      // 检查内存缓存
      const memoryEntry = this.memoryCache.get(key);
      return memoryEntry !== undefined && Date.now() < memoryEntry.expiry;
    } catch (error: any) {
      this.logger.warn(`缓存存在检查失败: key=${key}, error=${error.message}`);
      return false;
    }
  }

  /**
   * 生成缓存键
   */
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    if (this.redisService) {
      return this.redisService.generateKey(prefix, ...parts);
    }
    return `${prefix}:${parts.join(':')}`;
  }

  /**
   * 清理过期的内存缓存项
   */
  private cleanupExpiredEntries(): void {
    // 每100次操作清理一次，避免频繁清理
    if (Math.random() < 0.01) {
      const now = Date.now();
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now >= entry.expiry) {
          this.memoryCache.delete(key);
        }
      }
    }
  }

  /**
   * 清空所有缓存（仅内存缓存）
   * 
   * 注意: Redis缓存清空需要直接操作Redis，这里只清空内存缓存
   */
  clear(): void {
    this.memoryCache.clear();
    this.logger.log('内存缓存已清空');
  }
}
