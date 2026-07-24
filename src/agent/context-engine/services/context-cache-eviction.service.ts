/**
 * DSO 版本提交后的 Context Package 因果缓存失效（进程内 L1 / in-flight / 可选 Redis 登记键）。
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import {
  sweepInFlightBuildsByTripVersionPrefix,
  sweepMemoryCacheByTripVersionPrefix,
} from '../utils/context-cache-causal.util';
import type { ContextPackage } from '../types/context-package.types';

const REDIS_INDEX_PREFIX = 'context_package_index:';

@Injectable()
export class ContextCacheEvictionService {
  private readonly logger = new Logger(ContextCacheEvictionService.name);

  /** ContextEngineerService 全局 L1（可选注册） */
  private engineerMemoryCache?: Map<string, { package: ContextPackage; timestamp: number }>;
  private engineerInFlight?: Map<string, Promise<ContextPackage>>;

  /** ContextCacheService 全局 L1（可选注册） */
  private contextCacheMemory?: Map<string, { package: ContextPackage; timestamp: number }>;

  constructor(@Optional() private readonly redisService?: RedisService) {}

  registerEngineerCaches(
    memoryCache: Map<string, { package: ContextPackage; timestamp: number }>,
    inFlightBuilds: Map<string, Promise<ContextPackage>>,
  ): void {
    this.engineerMemoryCache = memoryCache;
    this.engineerInFlight = inFlightBuilds;
  }

  registerContextCacheMemory(memoryCache: Map<string, { package: ContextPackage; timestamp: number }>): void {
    this.contextCacheMemory = memoryCache;
  }

  /** L2 set 时登记完整 Redis key，供版本提交后精准 del */
  async registerRedisCacheKey(tripId: string, cacheKey: string): Promise<void> {
    if (!this.redisService || !tripId || tripId === 'none') return;
    const indexKey = `${REDIS_INDEX_PREFIX}${tripId}`;
    try {
      const existing = (await this.redisService.get<string[]>(indexKey)) ?? [];
      const fullKey = `context_package:${cacheKey}`;
      if (!existing.includes(fullKey)) {
        existing.push(fullKey);
        if (existing.length > 200) {
          existing.splice(0, existing.length - 200);
        }
        await this.redisService.set(indexKey, existing, 3600);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`[ContextCacheEviction] registerRedisCacheKey skipped: ${msg}`);
    }
  }

  /**
   * StateManager 成功 commit 后调用：作废 supersededVersion 对应的所有因果 Key。
   */
  async evictSupersededDsoVersion(input: {
    tripId?: string | null;
    supersededVersion: number;
  }): Promise<void> {
    const tripId = String(input.tripId ?? '').trim();
    if (!tripId || tripId === 'none') {
      return;
    }
    const ver = Math.floor(input.supersededVersion);
    if (!Number.isFinite(ver) || ver < 0) {
      return;
    }

    let swept = 0;
    if (this.engineerMemoryCache) {
      swept += sweepMemoryCacheByTripVersionPrefix(this.engineerMemoryCache, tripId, ver);
    }
    if (this.contextCacheMemory) {
      swept += sweepMemoryCacheByTripVersionPrefix(this.contextCacheMemory, tripId, ver);
    }
    if (this.engineerInFlight) {
      swept += sweepInFlightBuildsByTripVersionPrefix(this.engineerInFlight, tripId, ver);
    }

    let redisDel = 0;
    if (this.redisService) {
      redisDel = await this.evictRedisKeysForTripVersion(tripId, ver);
    }

    if (swept > 0 || redisDel > 0) {
      this.logger.debug(
        `[ContextCacheEviction] trip=${tripId} supersededVer=${ver} memory=${swept} redis=${redisDel}`,
      );
    }
  }

  private async evictRedisKeysForTripVersion(tripId: string, supersededVersion: number): Promise<number> {
    const indexKey = `${REDIS_INDEX_PREFIX}${tripId}`;
    const needle = `:ver:${supersededVersion}:`;
    try {
      const keys = (await this.redisService!.get<string[]>(indexKey)) ?? [];
      const toDelete = keys.filter((k) => k.includes(needle));
      for (const fullKey of toDelete) {
        await this.redisService!.del(fullKey);
      }
      const remaining = keys.filter((k) => !k.includes(needle));
      if (remaining.length > 0) {
        await this.redisService!.set(indexKey, remaining, 3600);
      } else {
        await this.redisService!.del(indexKey);
      }
      return toDelete.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[ContextCacheEviction] Redis evict failed trip=${tripId}: ${msg}`);
      return 0;
    }
  }
}
