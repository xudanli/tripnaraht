// src/trips/decision/performance/cache.service.ts

/**
 * 性能优化：缓存策略
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';

interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number; // Time to live (ms)
}

@Injectable()
export class DecisionCacheService {
  private readonly logger = new Logger(DecisionCacheService.name);
  private readonly cache = new Map<string, CacheEntry<any>>();

  /**
   * 缓存计划
   */
  cachePlan(stateKey: string, plan: TripPlan, ttl: number = 3600000): void {
    // 1小时默认TTL
    this.cache.set(stateKey, {
      key: stateKey,
      value: plan,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 获取缓存的计划
   */
  getCachedPlan(stateKey: string): TripPlan | null {
    const entry = this.cache.get(stateKey);
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(stateKey);
      return null;
    }

    return entry.value;
  }

  /**
   * 生成状态键（用于缓存）
   */
  generateStateKey(state: TripWorldState): string {
    // 基于关键字段生成哈希键
    const keyParts = [
      state.context.destination,
      state.context.startDate,
      state.context.durationDays.toString(),
      state.context.preferences.pace,
      JSON.stringify(state.context.preferences.intents),
      state.signals.lastUpdatedAt,
    ];

    return this.hashString(keyParts.join('|'));
  }

  /**
   * 批量计算优化：缓存中间结果
   */
  cacheIntermediateResult(key: string, result: any, ttl: number = 1800000): void {
    // 30分钟默认TTL
    this.cache.set(key, {
      key,
      value: result,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 获取中间结果
   */
  getCachedIntermediateResult(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * 清理过期缓存
   */
  cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * 简单哈希函数
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

