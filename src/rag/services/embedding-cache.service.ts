// src/rag/services/embedding-cache.service.ts
/**
 * Embedding 缓存服务
 * 
 * 职责：
 * - 缓存查询文本的 embedding，避免重复生成
 * - 提供缓存统计（命中率、延迟等）
 * - 支持缓存失效和清理
 * 
 * 缓存策略：
 * - Key: `embedding:${hash(text)}`
 * - TTL: 24小时（86400秒）
 * - 降级：Redis不可用时使用内存缓存
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

export interface EmbeddingCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  cacheSize: number;
  avgLatencyMs: number;
}

@Injectable()
export class EmbeddingCacheService {
  private readonly logger = new Logger(EmbeddingCacheService.name);
  private readonly CACHE_PREFIX = 'embedding';
  private readonly DEFAULT_TTL = 86400; // 24小时

  // 内存缓存（降级使用）
  private readonly memoryCache = new Map<string, { embedding: number[]; expires: number }>();

  // 统计信息
  private stats = {
    hits: 0,
    misses: 0,
    totalLatencyMs: 0,
    requestCount: 0,
  };

  constructor(@Optional() private readonly redisService?: RedisService) {
    if (!redisService) {
      this.logger.warn('RedisService not available, using in-memory cache only');
    } else {
      this.logger.log('✅ Embedding缓存服务已启用（Redis）');
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(text: string): string {
    // 使用SHA256哈希文本，避免键过长
    const hash = crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
    return `${this.CACHE_PREFIX}:${hash}`;
  }

  /**
   * 从缓存获取 embedding
   */
  async get(text: string): Promise<number[] | null> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(text);

    try {
      // 优先使用Redis缓存
      if (this.redisService) {
        const cached = await this.redisService.get<number[]>(cacheKey);
        if (cached) {
          const latency = Date.now() - startTime;
          this.recordHit(latency);
          this.logger.debug(`✅ Embedding缓存命中: ${text.substring(0, 50)}... (${latency}ms)`);
          return cached;
        }
      }

      // 降级到内存缓存
      const memoryCached = this.memoryCache.get(cacheKey);
      if (memoryCached && memoryCached.expires > Date.now()) {
        const latency = Date.now() - startTime;
        this.recordHit(latency);
        this.logger.debug(`✅ Embedding内存缓存命中: ${text.substring(0, 50)}... (${latency}ms)`);
        return memoryCached.embedding;
      }

      // 缓存未命中
      const latency = Date.now() - startTime;
      this.recordMiss(latency);
      this.logger.debug(`❌ Embedding缓存未命中: ${text.substring(0, 50)}... (${latency}ms)`);
      return null;
    } catch (error: any) {
      this.logger.warn(`获取缓存失败: ${error.message}`);
      this.recordMiss(Date.now() - startTime);
      return null;
    }
  }

  /**
   * 设置缓存
   * 
   * 优化：先写入内存缓存（同步，立即可用），然后异步写入Redis
   * 这样可以避免并发请求在Redis写入完成前检查缓存时未命中
   */
  async set(text: string, embedding: number[], ttl: number = this.DEFAULT_TTL): Promise<void> {
    const cacheKey = this.generateCacheKey(text);

    // 1. 先写入内存缓存（同步，立即可用）
    const expires = Date.now() + ttl * 1000;
    this.memoryCache.set(cacheKey, { embedding, expires });
    this.logger.debug(`💾 Embedding已写入内存缓存: ${text.substring(0, 50)}... (TTL: ${ttl}s)`);

    // 2. 异步写入Redis（不阻塞）
    if (this.redisService) {
      this.redisService.set(cacheKey, embedding, ttl).then(() => {
        this.logger.debug(`💾 Embedding已缓存到Redis: ${text.substring(0, 50)}... (TTL: ${ttl}s)`);
      }).catch((error: any) => {
        this.logger.warn(`Redis缓存写入失败（已写入内存缓存）: ${error.message}`);
      });
    }

    // 3. 清理过期内存缓存（每100次操作清理一次）
    if (this.memoryCache.size > 1000) {
      this.cleanExpiredMemoryCache();
    }
  }

  /**
   * 删除缓存
   */
  async delete(text: string): Promise<void> {
    const cacheKey = this.generateCacheKey(text);

    try {
      if (this.redisService) {
        await this.redisService.del(cacheKey);
      }
      this.memoryCache.delete(cacheKey);
      this.logger.debug(`🗑️  Embedding缓存已删除: ${text.substring(0, 50)}...`);
    } catch (error: any) {
      this.logger.warn(`删除缓存失败: ${error.message}`);
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      // 注意：Redis的reset需要直接操作Redis，这里只清空内存缓存
      this.memoryCache.clear();
      this.logger.warn('⚠️  内存缓存已清空，Redis缓存需要手动清空');
    } catch (error: any) {
      this.logger.error(`清空缓存失败: ${error.message}`);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): EmbeddingCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const avgLatencyMs = this.stats.requestCount > 0 
      ? this.stats.totalLatencyMs / this.stats.requestCount 
      : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      totalRequests,
      cacheSize: this.memoryCache.size,
      avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalLatencyMs: 0,
      requestCount: 0,
    };
  }

  /**
   * 记录缓存命中
   */
  private recordHit(latencyMs: number): void {
    this.stats.hits++;
    this.stats.requestCount++;
    this.stats.totalLatencyMs += latencyMs;
  }

  /**
   * 记录缓存未命中
   */
  private recordMiss(latencyMs: number): void {
    this.stats.misses++;
    this.stats.requestCount++;
    this.stats.totalLatencyMs += latencyMs;
  }

  /**
   * 清理过期的内存缓存
   */
  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expires <= now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`🧹 清理了 ${cleaned} 个过期的内存缓存项`);
    }
  }
}
