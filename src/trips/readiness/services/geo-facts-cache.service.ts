// src/trips/readiness/services/geo-facts-cache.service.ts

/**
 * Geo Facts Cache Service - 地理特征缓存服务
 * 
 * 为地理特征查询提供缓存机制，优化性能
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeoFeatures } from './geo-facts.service';

interface CacheEntry {
  data: GeoFeatures;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

@Injectable()
export class GeoFactsCacheService {
  private readonly logger = new Logger(GeoFactsCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 3600000; // 1 hour in milliseconds

  /**
   * 生成缓存键
   */
  private generateKey(lat: number, lng: number, options?: any): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `geo:${lat.toFixed(4)}:${lng.toFixed(4)}:${optionsStr}`;
  }

  /**
   * 获取缓存
   */
  get(lat: number, lng: number, options?: any): GeoFeatures | null {
    const key = this.generateKey(lat, lng, options);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.logger.debug(`Cache expired for key: ${key}`);
      return null;
    }

    this.logger.debug(`Cache hit for key: ${key}`);
    return entry.data;
  }

  /**
   * 设置缓存
   */
  set(
    lat: number,
    lng: number,
    data: GeoFeatures,
    options?: any,
    ttl?: number
  ): void {
    const key = this.generateKey(lat, lng, options);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, entry);
    this.logger.debug(`Cache set for key: ${key}`);

    // 定期清理过期缓存（每 10 分钟）
    if (this.cache.size > 1000) {
      this.cleanup();
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 预热缓存（可选）
   */
  async warmup(
    coordinates: Array<{ lat: number; lng: number }>,
    fetcher: (lat: number, lng: number) => Promise<GeoFeatures>
  ): Promise<void> {
    this.logger.log(`Warming up cache for ${coordinates.length} coordinates`);

    const promises = coordinates.map(async ({ lat, lng }) => {
      try {
        const data = await fetcher(lat, lng);
        this.set(lat, lng, data);
      } catch (error) {
        this.logger.warn(`Failed to warmup cache for ${lat}, ${lng}: ${error}`);
      }
    });

    await Promise.all(promises);
    this.logger.log('Cache warmup completed');
  }
}

