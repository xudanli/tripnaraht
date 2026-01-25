// src/rag/services/hybrid-cache.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';
import { RagMetricsService } from './rag-metrics.service';

/**
 * 混合缓存服务
 *
 * 策略：
 * 1. 优先使用 Redis（分布式缓存）
 * 2. Redis 不可用时降级到内存缓存
 * 3. 自动切换，对调用者透明
 *
 * 用途：
 * - McpToolsService API 调用缓存
 * - WebBrowseSkill 网页内容缓存
 * - RagFallbackService 检索结果缓存
 *
 * Phase 5.5 新增：
 * - Prometheus监控集成
 */
@Injectable()
export class HybridCacheService {
  private readonly logger = new Logger(HybridCacheService.name);

  // 内存缓存降级
  private memoryCache = new Map<string, { data: any; expiry: number }>();

  constructor(
    @Optional() private readonly redisCache?: RedisCacheService,
    @Optional() private readonly metrics?: RagMetricsService,
  ) {
    if (this.redisCache) {
      this.logger.log('[HybridCache] Redis 缓存已启用');
    } else {
      this.logger.warn('[HybridCache] Redis 不可用，使用内存缓存');
    }
  }

  /**
   * 获取缓存值
   *
   * @param key - 缓存键
   * @returns 缓存值（如果存在且未过期）
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();

    // 优先使用 Redis
    if (this.redisCache?.isReady()) {
      try {
        const value = await this.redisCache.get<T>(key);
        if (value !== null) {
          this.logger.debug(`[HybridCache] Redis hit: ${key}`);
          this.metrics?.recordCacheHit('redis');
          this.metrics?.recordCacheOperation('redis', 'get', Date.now() - startTime);
          return value;
        }
      } catch (error: any) {
        this.logger.warn(`[HybridCache] Redis 获取失败，降级到内存: ${error.message}`);
      }
    }

    // 降级到内存缓存
    const result = this.getFromMemory<T>(key);
    const duration = Date.now() - startTime;

    if (result !== null) {
      this.metrics?.recordCacheHit('memory');
    } else {
      this.metrics?.recordCacheMiss('hybrid');
    }

    this.metrics?.recordCacheOperation('memory', 'get', duration);

    return result;
  }

  /**
   * 设置缓存值
   *
   * @param key - 缓存键
   * @param value - 缓存值
   * @param ttlSeconds - 过期时间（秒），默认 3600 秒（1 小时）
   */
  async set<T>(key: string, value: T, ttlSeconds = 3600): Promise<boolean> {
    const startTime = Date.now();
    let redisSuccess = false;

    // 优先写入 Redis
    if (this.redisCache?.isReady()) {
      try {
        redisSuccess = await this.redisCache.set(key, value, ttlSeconds);
        if (redisSuccess) {
          this.logger.debug(`[HybridCache] Redis set: ${key} (TTL: ${ttlSeconds}s)`);
          this.metrics?.recordCacheOperation('redis', 'set', Date.now() - startTime);
        }
      } catch (error: any) {
        this.logger.warn(`[HybridCache] Redis 设置失败，降级到内存: ${error.message}`);
      }
    }

    // 同时写入内存缓存（双写策略）
    this.setToMemory(key, value, ttlSeconds);
    this.metrics?.recordCacheOperation('memory', 'set', Date.now() - startTime);
    this.metrics?.updateCacheSize('memory', this.memoryCache.size);

    return redisSuccess || true; // 内存缓存总是成功
  }

  /**
   * 删除缓存值
   *
   * @param key - 缓存键
   */
  async del(key: string): Promise<boolean> {
    let redisSuccess = false;

    // 从 Redis 删除
    if (this.redisCache?.isReady()) {
      try {
        redisSuccess = await this.redisCache.del(key);
      } catch (error: any) {
        this.logger.warn(`[HybridCache] Redis 删除失败: ${error.message}`);
      }
    }

    // 从内存删除
    const memorySuccess = this.memoryCache.delete(key);

    return redisSuccess || memorySuccess;
  }

  /**
   * 批量删除缓存（使用 pattern）
   *
   * @param pattern - 键模式（例如 "weather:*"）
   */
  async delPattern(pattern: string): Promise<number> {
    let count = 0;

    // 从 Redis 批量删除
    if (this.redisCache?.isReady()) {
      try {
        count = await this.redisCache.delPattern(pattern);
      } catch (error: any) {
        this.logger.warn(`[HybridCache] Redis 批量删除失败: ${error.message}`);
      }
    }

    // 从内存批量删除
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 检查缓存是否存在
   *
   * @param key - 缓存键
   */
  async exists(key: string): Promise<boolean> {
    // 检查 Redis
    if (this.redisCache?.isReady()) {
      try {
        const exists = await this.redisCache.exists(key);
        if (exists) {
          return true;
        }
      } catch (error: any) {
        this.logger.warn(`[HybridCache] Redis exists 失败: ${error.message}`);
      }
    }

    // 检查内存
    const cached = this.memoryCache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return true;
    }

    return false;
  }

  /**
   * 清空所有缓存
   */
  async flushAll(): Promise<boolean> {
    let redisSuccess = false;

    // 清空 Redis
    if (this.redisCache?.isReady()) {
      try {
        redisSuccess = await this.redisCache.flushAll();
      } catch (error: any) {
        this.logger.warn(`[HybridCache] Redis flushAll 失败: ${error.message}`);
      }
    }

    // 清空内存
    this.memoryCache.clear();

    this.logger.log('[HybridCache] 所有缓存已清空');
    return redisSuccess || true;
  }

  /**
   * 从内存缓存获取
   */
  private getFromMemory<T>(key: string): T | null {
    const cached = this.memoryCache.get(key);

    if (!cached) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > cached.expiry) {
      this.memoryCache.delete(key);
      return null;
    }

    this.logger.debug(`[HybridCache] Memory hit: ${key}`);
    return cached.data as T;
  }

  /**
   * 写入内存缓存
   */
  private setToMemory<T>(key: string, value: T, ttlSeconds: number): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.memoryCache.set(key, { data: value, expiry });
    this.logger.debug(`[HybridCache] Memory set: ${key} (TTL: ${ttlSeconds}s)`);
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    memorySize: number;
    redisConnected: boolean;
  } {
    return {
      memorySize: this.memoryCache.size,
      redisConnected: this.redisCache?.isReady() || false,
    };
  }

  /**
   * 清理过期的内存缓存
   */
  cleanupExpired(): number {
    let count = 0;
    const now = Date.now();

    for (const [key, cached] of this.memoryCache.entries()) {
      if (now > cached.expiry) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug(`[HybridCache] 清理了 ${count} 个过期内存缓存`);
    }

    return count;
  }
}
