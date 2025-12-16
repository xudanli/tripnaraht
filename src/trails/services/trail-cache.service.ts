// src/trails/services/trail-cache.service.ts

import { Injectable } from '@nestjs/common';

/**
 * Trail数据缓存服务
 * 
 * 缓存频繁查询的Trail数据，提升性能
 */
@Injectable()
export class TrailCacheService {
  // 缓存：Trail基本信息（key: trailId, value: trail data, ttl: 5分钟）
  private trailCache = new Map<number, { data: any; expiresAt: number }>();

  // 缓存：Trail沿途景点（key: `${trailId}-${radiusKm}`, ttl: 10分钟）
  private placesAlongCache = new Map<string, { data: any; expiresAt: number }>();

  // 缓存：Trail推荐（key: `${placeIds.join(',')}-${options}`, ttl: 15分钟）
  private recommendationCache = new Map<string, { data: any; expiresAt: number }>();

  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5分钟

  /**
   * 获取Trail缓存
   */
  getTrail(trailId: number): any | null {
    const cached = this.trailCache.get(trailId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    this.trailCache.delete(trailId);
    return null;
  }

  /**
   * 设置Trail缓存
   */
  setTrail(trailId: number, data: any, ttl: number = this.DEFAULT_TTL): void {
    this.trailCache.set(trailId, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * 获取沿途景点缓存
   */
  getPlacesAlong(trailId: number, radiusKm: number): any | null {
    const key = `${trailId}-${radiusKm}`;
    const cached = this.placesAlongCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    this.placesAlongCache.delete(key);
    return null;
  }

  /**
   * 设置沿途景点缓存
   */
  setPlacesAlong(trailId: number, radiusKm: number, data: any, ttl: number = 10 * 60 * 1000): void {
    const key = `${trailId}-${radiusKm}`;
    this.placesAlongCache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * 获取推荐缓存
   */
  getRecommendation(placeIds: number[], options: any): any | null {
    const key = this.getRecommendationKey(placeIds, options);
    const cached = this.recommendationCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    this.recommendationCache.delete(key);
    return null;
  }

  /**
   * 设置推荐缓存
   */
  setRecommendation(placeIds: number[], options: any, data: any, ttl: number = 15 * 60 * 1000): void {
    const key = this.getRecommendationKey(placeIds, options);
    this.recommendationCache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.trailCache.clear();
    this.placesAlongCache.clear();
    this.recommendationCache.clear();
  }

  /**
   * 清除指定Trail的缓存
   */
  clearTrail(trailId: number): void {
    this.trailCache.delete(trailId);
    // 清除相关的沿途景点缓存
    for (const key of this.placesAlongCache.keys()) {
      if (key.startsWith(`${trailId}-`)) {
        this.placesAlongCache.delete(key);
      }
    }
  }

  private getRecommendationKey(placeIds: number[], options: any): string {
    const sortedIds = [...placeIds].sort((a, b) => a - b).join(',');
    const optionsStr = JSON.stringify(options || {});
    return `${sortedIds}-${optionsStr}`;
  }

  /**
   * 定期清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();

    // 清理Trail缓存
    for (const [key, value] of this.trailCache.entries()) {
      if (value.expiresAt <= now) {
        this.trailCache.delete(key);
      }
    }

    // 清理沿途景点缓存
    for (const [key, value] of this.placesAlongCache.entries()) {
      if (value.expiresAt <= now) {
        this.placesAlongCache.delete(key);
      }
    }

    // 清理推荐缓存
    for (const [key, value] of this.recommendationCache.entries()) {
      if (value.expiresAt <= now) {
        this.recommendationCache.delete(key);
      }
    }
  }
}

