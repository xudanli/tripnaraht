// src/itinerary-items/services/travel-time-cache.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * 缓存的交通时间数据
 */
interface CachedTravelTime {
  straightDistance: number;
  roadDistance?: number;
  estimatedDuration: number;
  recommendedTransport: 'WALKING' | 'DRIVING' | 'TRANSIT';
  cachedAt: number;
}

/**
 * 交通时间缓存服务
 * 
 * 缓存计算过的交通时间，避免重复调用外部 API
 * 缓存有效期：2小时
 */
@Injectable()
export class TravelTimeCacheService {
  private readonly logger = new Logger(TravelTimeCacheService.name);
  private readonly cache = new Map<string, CachedTravelTime>();
  
  /** 缓存有效期（毫秒）：2小时 */
  private readonly TTL_MS = 2 * 60 * 60 * 1000;
  
  /** 最大缓存条目数 */
  private readonly MAX_ENTRIES = 1000;

  /**
   * 获取缓存
   */
  get(key: string): Omit<CachedTravelTime, 'cachedAt'> | undefined {
    const cached = this.cache.get(key);
    if (!cached) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - cached.cachedAt > this.TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }

    const { cachedAt: _cachedAt, ...data } = cached;
    return data;
  }

  /**
   * 设置缓存
   */
  set(key: string, value: Omit<CachedTravelTime, 'cachedAt'>): void {
    // 检查是否需要清理
    if (this.cache.size >= this.MAX_ENTRIES) {
      this.cleanup();
    }

    this.cache.set(key, {
      ...value,
      cachedAt: Date.now(),
    });
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.logger.log('缓存已清空');
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      ttlMs: this.TTL_MS,
    };
  }

  /**
   * 清理过期和多余的缓存
   */
  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // 先删除过期的
    let deleted = 0;
    for (const [key, value] of entries) {
      if (now - value.cachedAt > this.TTL_MS) {
        this.cache.delete(key);
        deleted++;
      }
    }

    // 如果还是太多，删除最旧的一半
    if (this.cache.size >= this.MAX_ENTRIES) {
      const remaining = Array.from(this.cache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      
      const toDelete = Math.floor(remaining.length / 2);
      for (let i = 0; i < toDelete; i++) {
        this.cache.delete(remaining[i][0]);
        deleted++;
      }
    }

    if (deleted > 0) {
      this.logger.debug(`清理了 ${deleted} 条缓存`);
    }
  }
}
