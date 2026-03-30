// src/trips/readiness/services/readiness-cache.service.ts

/**
 * Readiness Cache Service
 * 
 * 分层缓存服务（L1/L2/L3）
 * - L1: 内存缓存（5分钟）
 * - L2: Redis 缓存（24小时）
 * - L3: 数据库缓存（7天，可选）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { UserProfile } from '../types/ai-enhanced.types';
import * as crypto from 'crypto';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  cacheVersion?: string;
}

interface CacheVersion {
  version: string;
  timestamp: number;
  rulesEngineVersion: string;
}

@Injectable()
export class ReadinessCacheService {
  private readonly logger = new Logger(ReadinessCacheService.name);
  
  // L1: 内存缓存（5分钟）
  private readonly memoryCache = new Map<string, CacheEntry<any>>();
  private readonly L1_TTL_MS = 5 * 60 * 1000; // 5 分钟
  
  // 缓存版本号键
  private readonly CACHE_VERSION_KEY = 'readiness:cache:version';

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {
    if (!redisService) {
      this.logger.warn('RedisService not available, using L1 cache only');
    }
  }

  /**
   * 获取缓存（分层查找）
   */
  async get<T>(key: string): Promise<T | null> {
    // L1: 内存缓存（5分钟）
    const l1Entry = this.memoryCache.get(key);
    if (l1Entry && Date.now() - l1Entry.timestamp < this.L1_TTL_MS) {
      // 检查版本一致性
      if (await this.checkCacheVersion(key, l1Entry)) {
        return l1Entry.data as T;
      } else {
        // 版本不一致，删除 L1 缓存
        this.memoryCache.delete(key);
      }
    }

    // L2: Redis 缓存（24小时）
    if (this.redisService) {
      try {
        const l2Data = await this.redisService.get<CacheEntry<T>>(key);
        if (l2Data) {
          // 检查版本一致性
          if (await this.checkCacheVersion(key, l2Data)) {
            // 回填 L1 缓存
            this.memoryCache.set(key, {
              data: l2Data.data,
              timestamp: Date.now(),
              cacheVersion: l2Data.cacheVersion,
            });
            return l2Data.data as T;
          } else {
            // 版本不一致，删除 L2 缓存
            await this.redisService.del(key);
          }
        }
      } catch (error) {
        this.logger.warn(`Redis cache get failed for key: ${key}`, error);
      }
    }

    return null;
  }

  /**
   * 设置缓存（分层存储）
   */
  async set<T>(key: string, data: T, options: { ttl?: number } = {}): Promise<void> {
    const ttl = options.ttl || 24 * 60 * 60; // 默认 24 小时（秒）
    const version = await this.getCacheVersion();

    const cacheEntry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      cacheVersion: version.version,
    };

    // L1: 内存缓存
    this.memoryCache.set(key, cacheEntry);

    // L2: Redis 缓存
    if (this.redisService) {
      try {
        await this.redisService.set(key, cacheEntry, ttl);
      } catch (error) {
        this.logger.warn(`Redis cache set failed for key: ${key}`, error);
      }
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    // 删除 L1 缓存
    this.memoryCache.delete(key);

    // 删除 L2 缓存
    if (this.redisService) {
      try {
        await this.redisService.del(key);
      } catch (error) {
        this.logger.warn(`Redis cache del failed for key: ${key}`, error);
      }
    }
  }

  /**
   * 生成缓存键
   */
  generateCacheKey(
    type: string,
    baseResult: ReadinessCheckResult,
    userProfile?: UserProfile,
  ): string {
    const hash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          type,
          tripId: (baseResult as any).tripId,
          userProfileHash: userProfile ? this.hashUserProfile(userProfile) : 'anonymous',
          resultHash: this.hashResult(baseResult),
        }),
      )
      .digest('hex');

    return `readiness:${type}:${hash}`;
  }

  /**
   * 用户画像哈希
   */
  private hashUserProfile(userProfile: UserProfile): string {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          userId: userProfile.userId,
          nationality: userProfile.nationality,
          budgetLevel: userProfile.budgetLevel,
          riskTolerance: userProfile.riskTolerance,
          tags: userProfile.tags?.sort(),
        }),
      )
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * 结果哈希
   */
  private hashResult(result: ReadinessCheckResult): string {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          totalBlockers: result.summary.totalBlockers,
          totalMust: result.summary.totalMust,
          findings: result.findings.map(f => ({
            destinationId: f.destinationId,
            packId: f.packId,
            packVersion: f.packVersion,
          })),
        }),
      )
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * 获取缓存版本号
   */
  async getCacheVersion(): Promise<CacheVersion> {
    if (this.redisService) {
      try {
        const version = await this.redisService.get<CacheVersion>(this.CACHE_VERSION_KEY);
        if (version) {
          return version;
        }
      } catch (error) {
        this.logger.warn('Failed to get cache version from Redis', error);
      }
    }

    // 默认版本
    return {
      version: 'v1.0.0',
      timestamp: Date.now(),
      rulesEngineVersion: 'latest',
    };
  }

  /**
   * 更新缓存版本号
   */
  async updateCacheVersion(rulesEngineVersion?: string): Promise<void> {
    const currentVersion = await this.getCacheVersion();
    const newVersion: CacheVersion = {
      version: this.incrementVersion(currentVersion.version),
      timestamp: Date.now(),
      rulesEngineVersion: rulesEngineVersion || currentVersion.rulesEngineVersion,
    };

    if (this.redisService) {
      try {
        await this.redisService.set(this.CACHE_VERSION_KEY, newVersion, 365 * 24 * 60 * 60); // 1 年
      } catch (error) {
        this.logger.warn('Failed to update cache version in Redis', error);
      }
    }
  }

  /**
   * 检查缓存版本一致性
   */
  private async checkCacheVersion(
    key: string,
    entry: CacheEntry<any>,
  ): Promise<boolean> {
    if (!entry.cacheVersion) {
      return true; // 旧缓存，没有版本号，允许使用
    }

    const currentVersion = await this.getCacheVersion();
    if (entry.cacheVersion !== currentVersion.version) {
      // 版本不一致，失效该缓存
      await this.del(key);
      return false;
    }

    return true;
  }

  /**
   * 递增版本号
   */
  private incrementVersion(version: string): string {
    const match = version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (match) {
      const [, major, minor, patch] = match;
      return `v${major}.${minor}.${parseInt(patch) + 1}`;
    }
    return `v1.0.${Date.now()}`;
  }

  /**
   * 失效所有缓存（用于规则引擎更新）
   */
  async invalidateAll(reason: string): Promise<void> {
    this.logger.log(`Invalidating all readiness caches, reason: ${reason}`);
    
    // 更新版本号，自动失效所有旧缓存
    await this.updateCacheVersion();
    
    // 清空 L1 缓存
    this.memoryCache.clear();
  }
}
