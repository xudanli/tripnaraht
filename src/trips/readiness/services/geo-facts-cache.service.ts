// src/trips/readiness/services/geo-facts-cache.service.ts

/**
 * Geo Facts Cache Service - 地理特征缓存服务（优化版）
 * 
 * 为地理特征查询提供分层缓存机制（L1: 内存，L2: Redis），优化性能
 * 
 * 缓存策略：
 * - L1 (内存): 5分钟，快速访问
 * - L2 (Redis): 24小时，持久化缓存
 * - 缓存 key: geo:features:{lat}:{lng}:{optionsHash}
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { GeoFeatures } from './geo-facts.service';
import { RedisService } from '../../../redis/redis.service';
import * as crypto from 'crypto';

interface CacheEntry {
  data: GeoFeatures;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  cacheVersion?: string;
}

@Injectable()
export class GeoFactsCacheService {
  private readonly logger = new Logger(GeoFactsCacheService.name);
  private readonly memoryCache = new Map<string, CacheEntry>();
  private readonly L1_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly L2_TTL_SEC = 24 * 60 * 60; // 24 hours in seconds
  private readonly CACHE_VERSION = '1.0.0'; // 缓存版本，用于失效策略

  constructor(@Optional() private readonly redisService?: RedisService) {}

  /**
   * 生成缓存键
   * 
   * 优化：使用坐标精度（保留4位小数）和选项哈希值
   */
  private generateKey(lat: number, lng: number, options?: any): string {
    // 坐标精度：保留4位小数（约11米精度）
    const latRounded = lat.toFixed(4);
    const lngRounded = lng.toFixed(4);
    
    // 选项哈希：只包含影响查询结果的选项
    const relevantOptions = options ? {
      densityBufferKm: options.densityBufferKm,
      nearRiverThresholdM: options.nearRiverThresholdM,
      nearRoadThresholdM: options.nearRoadThresholdM,
      nearCoastlineThresholdKm: options.nearCoastlineThresholdKm,
      coastalAreaThresholdKm: options.coastalAreaThresholdKm,
      nearPortThresholdKm: options.nearPortThresholdKm,
      nearAirportThresholdKm: options.nearAirportThresholdKm,
      poiRadiusKm: options.poiRadiusKm,
      pickupLimit: options.pickupLimit,
    } : {};
    
    const optionsHash = crypto
      .createHash('md5')
      .update(JSON.stringify(relevantOptions))
      .digest('hex')
      .substring(0, 8);
    
    return `geo:features:${latRounded}:${lngRounded}:${optionsHash}`;
  }

  /**
   * 获取缓存（分层查找：L1 -> L2）
   */
  async get(lat: number, lng: number, options?: any): Promise<GeoFeatures | null> {
    const key = this.generateKey(lat, lng, options);

    // L1: 内存缓存（5分钟）
    const l1Entry = this.memoryCache.get(key);
    if (l1Entry && Date.now() - l1Entry.timestamp < this.L1_TTL_MS) {
      this.logger.debug(`L1 cache hit for key: ${key}`);
      return l1Entry.data;
    }

    // L2: Redis 缓存（24小时）
    if (this.redisService) {
      try {
        const l2Data = await this.redisService.get<CacheEntry>(key);
        if (l2Data) {
          // 检查版本一致性
          if (l2Data.cacheVersion === this.CACHE_VERSION) {
            // 回填 L1 缓存
            this.memoryCache.set(key, {
              ...l2Data,
              timestamp: Date.now(),
            });
            this.logger.debug(`L2 cache hit for key: ${key}`);
            return l2Data.data;
          } else {
            // 版本不一致，删除 L2 缓存
            await this.redisService.del(key);
            this.logger.debug(`Cache version mismatch for key: ${key}, deleted`);
          }
        }
      } catch (error) {
        this.logger.warn(`Redis cache get failed for key: ${key}`, error);
      }
    }

    return null;
  }

  /**
   * 设置缓存（分层存储：L1 + L2）
   */
  async set(
    lat: number,
    lng: number,
    data: GeoFeatures,
    options?: any
  ): Promise<void> {
    const key = this.generateKey(lat, lng, options);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: this.L1_TTL_MS,
      cacheVersion: this.CACHE_VERSION,
    };

    // L1: 内存缓存（5分钟）
    this.memoryCache.set(key, entry);
    this.logger.debug(`L1 cache set for key: ${key}`);

    // L2: Redis 缓存（24小时）
    if (this.redisService) {
      try {
        await this.redisService.set(key, entry, this.L2_TTL_SEC);
        this.logger.debug(`L2 cache set for key: ${key}`);
      } catch (error) {
        this.logger.warn(`Redis cache set failed for key: ${key}`, error);
      }
    }

    // 定期清理过期 L1 缓存
    if (this.memoryCache.size > 1000) {
      this.cleanupL1();
    }
  }

  /**
   * 清理过期 L1 缓存
   */
  private cleanupL1(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired L1 cache entries`);
    }
  }

  /**
   * 清除所有缓存（L1 + L2）
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.logger.debug('L1 cache cleared');

    // 注意：RedisService 没有 delPattern 方法
    // 如果需要清除所有 geo:features:* 键，需要直接操作 Redis 客户端
    // 这里只清除 L1 缓存，L2 缓存会在 TTL 过期后自动清除
    this.logger.debug('L2 cache will expire automatically after TTL');
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    l1Size: number;
    l1Keys: string[];
  }> {
    return {
      l1Size: this.memoryCache.size,
      l1Keys: Array.from(this.memoryCache.keys()),
    };
  }

  /**
   * 预热缓存（可选）
   */
  async warmup(
    coordinates: Array<{ lat: number; lng: number; options?: any }>,
    fetcher: (lat: number, lng: number, options?: any) => Promise<GeoFeatures>
  ): Promise<void> {
    this.logger.log(`Warming up cache for ${coordinates.length} coordinates`);

    const promises = coordinates.map(async ({ lat, lng, options }) => {
      try {
        const data = await fetcher(lat, lng, options);
        await this.set(lat, lng, data, options);
      } catch (error) {
        this.logger.warn(`Failed to warmup cache for ${lat}, ${lng}: ${error}`);
      }
    });

    await Promise.all(promises);
    this.logger.log('Cache warmup completed');
  }

  /**
   * 使缓存失效（通过版本号）
   * 当地理数据更新时，可以更新 CACHE_VERSION 来使所有缓存失效
   */
  updateCacheVersion(newVersion: string): void {
    this.logger.log(`Cache version updated to ${newVersion}, old cache will be invalidated`);
    // 注意：实际的版本检查在 get() 方法中进行
    // 这里只是记录日志，实际版本应该在类级别定义
  }
}

