/**
 * Context Cache Service
 *
 * Phase 5: Context Engine 工业化 - L1 内存 + L2 Redis
 * 职责：统一 key 格式、TTL、失效策略
 *
 * 参考: docs/CONTEXT_ENGINE_INDUSTRIALIZATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ContextPackage } from '../types/context-package.types';
import {
  ContextCacheGetResult,
  IContextCache,
} from '../interfaces/context-cache.interface';
import { RedisService } from '../../../redis/redis.service';

const CACHE_KEY_PREFIX = 'context_package:';
const L1_TTL_MS = 5 * 60 * 1000; // 5 分钟
const L2_TTL_MS = 15 * 60 * 1000; // 15 分钟
const L2_TTL_SECONDS = Math.floor(L2_TTL_MS / 1000);
const MAX_MEMORY_ENTRIES = 100;
const EVICT_RATIO = 0.2;

@Injectable()
export class ContextCacheService implements IContextCache {
  private readonly logger = new Logger(ContextCacheService.name);
  private readonly memoryCache = new Map<string, { package: ContextPackage; timestamp: number }>();

  constructor(@Optional() private readonly redisService?: RedisService) {}

  async get(key: string): Promise<ContextCacheGetResult> {
    // L1: 内存缓存
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && Date.now() - memoryCached.timestamp < L1_TTL_MS) {
      return { hit: true, package: memoryCached.package, level: 'L1' };
    }
    if (memoryCached) {
      this.memoryCache.delete(key);
    }

    // L2: Redis
    if (this.redisService) {
      try {
        const redisKey = `${CACHE_KEY_PREFIX}${key}`;
        const cached = await this.redisService.get<ContextPackage>(redisKey);
        if (cached) {
          this.memoryCache.set(key, { package: cached, timestamp: Date.now() });
          return { hit: true, package: cached, level: 'L2' };
        }
      } catch (error: any) {
        this.logger.warn(`L2 Redis get 失败: ${error.message}`);
      }
    }

    return { hit: false };
  }

  async set(key: string, pkg: ContextPackage): Promise<void> {
    this.memoryCache.set(key, { package: pkg, timestamp: Date.now() });
    this.cleanExpired();

    if (this.redisService) {
      try {
        const redisKey = `${CACHE_KEY_PREFIX}${key}`;
        await this.redisService.set(redisKey, pkg, L2_TTL_SECONDS);
        this.logger.debug(`Context Package 已存入 L2: ${key} (TTL: ${L2_TTL_SECONDS}s)`);
      } catch (error: any) {
        this.logger.warn(`L2 Redis set 失败: ${error.message}`);
      }
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.logger.debug('Context 内存缓存已清除');
  }

  getStats(): { memorySize: number; memoryKeys: string[] } {
    return {
      memorySize: this.memoryCache.size,
      memoryKeys: Array.from(this.memoryCache.keys()),
    };
  }

  /** 获取 Redis key 前缀（供 buildCacheKey 等使用） */
  getKeyPrefix(): string {
    return CACHE_KEY_PREFIX;
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.memoryCache.entries()) {
      if (now - v.timestamp >= L1_TTL_MS) this.memoryCache.delete(k);
    }
    if (this.memoryCache.size > MAX_MEMORY_ENTRIES) {
      const entries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = Math.floor(entries.length * EVICT_RATIO);
      for (let i = 0; i < toRemove; i++) this.memoryCache.delete(entries[i][0]);
    }
  }
}
