/**
 * Context Cache Service
 *
 * Phase 5: Context Engine 工业化 - L1 内存 + L2 Redis（因果 Key + 高危 phase 跳过 L2）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ContextPackage } from '../types/context-package.types';
import {
  ContextCacheGetResult,
  IContextCache,
} from '../interfaces/context-cache.interface';
import { RedisService } from '../../../redis/redis.service';
import {
  CONTEXT_L1_PROCESS_FALLBACK_TTL_MS,
  CONTEXT_L2_DYNAMIC_TTL_SECONDS,
  CONTEXT_L2_STATIC_TTL_SECONDS,
  isHighRiskContextPhase,
} from '../utils/context-cache-causal.util';
import { ContextCacheEvictionService } from './context-cache-eviction.service';

const CACHE_KEY_PREFIX = 'context_package:';
const MAX_MEMORY_ENTRIES = 100;
const EVICT_RATIO = 0.2;

export type ContextCacheSetOptions = {
  phase?: string;
  tripId?: string;
};

export type ContextCacheGetOptions = {
  phase?: string;
};

@Injectable()
export class ContextCacheService implements IContextCache {
  private readonly logger = new Logger(ContextCacheService.name);
  private readonly memoryCache = new Map<string, { package: ContextPackage; timestamp: number }>();

  constructor(
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly contextCacheEviction?: ContextCacheEvictionService,
  ) {
    this.contextCacheEviction?.registerContextCacheMemory(this.memoryCache);
  }

  async get(key: string, options?: ContextCacheGetOptions): Promise<ContextCacheGetResult> {
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && Date.now() - memoryCached.timestamp < CONTEXT_L1_PROCESS_FALLBACK_TTL_MS) {
      return { hit: true, package: memoryCached.package, level: 'L1' };
    }
    if (memoryCached) {
      this.memoryCache.delete(key);
    }

    if (isHighRiskContextPhase(options?.phase)) {
      return { hit: false };
    }

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

  async set(key: string, pkg: ContextPackage, options?: ContextCacheSetOptions): Promise<void> {
    this.memoryCache.set(key, { package: pkg, timestamp: Date.now() });
    this.cleanExpired();

    if (isHighRiskContextPhase(options?.phase)) {
      return;
    }

    if (this.redisService) {
      try {
        const redisKey = `${CACHE_KEY_PREFIX}${key}`;
        const tripId = options?.tripId?.trim();
        const ttlSeconds = tripId ? CONTEXT_L2_DYNAMIC_TTL_SECONDS : CONTEXT_L2_STATIC_TTL_SECONDS;
        await this.redisService.set(redisKey, pkg, ttlSeconds);
        if (tripId) {
          await this.contextCacheEviction?.registerRedisCacheKey(tripId, key);
        }
        this.logger.debug(`Context Package 已存入 L2: ${key} (TTL: ${ttlSeconds}s)`);
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

  getKeyPrefix(): string {
    return CACHE_KEY_PREFIX;
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.memoryCache.entries()) {
      if (now - v.timestamp >= CONTEXT_L1_PROCESS_FALLBACK_TTL_MS) {
        this.memoryCache.delete(k);
      }
    }
    if (this.memoryCache.size > MAX_MEMORY_ENTRIES) {
      const entries = Array.from(this.memoryCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      );
      const toRemove = Math.floor(entries.length * EVICT_RATIO);
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(entries[i][0]);
      }
    }
  }
}
