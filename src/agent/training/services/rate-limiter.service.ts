// src/agent/training/services/rate-limiter.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * RateLimiterService
 * 
 * 职责：实现限流器（Token Bucket算法）
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly buckets: Map<string, TokenBucket> = new Map();

  /**
   * 检查是否允许请求
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const bucket = this.getOrCreateBucket(key, config);

    const now = Date.now();
    const elapsed = now - bucket.lastRefillTime;
    const tokensToAdd = Math.floor((elapsed / 1000) * config.refillRate);

    // 补充token
    bucket.tokens = Math.min(
      config.capacity,
      bucket.tokens + tokensToAdd,
    );
    bucket.lastRefillTime = now;

    // 检查是否有足够的token
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
      };
    } else {
      return {
        allowed: false,
        remaining: 0,
      };
    }
  }

  /**
   * 获取或创建Token Bucket
   */
  private getOrCreateBucket(key: string, config: RateLimitConfig): TokenBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        key,
        tokens: config.capacity,
        lastRefillTime: Date.now(),
      });
    }
    return this.buckets.get(key)!;
  }

  /**
   * 获取剩余token数
   */
  getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket ? Math.floor(bucket.tokens) : 0;
  }

  /**
   * 重置限流器
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}

/**
 * Token Bucket
 */
interface TokenBucket {
  key: string;
  tokens: number;
  lastRefillTime: number;
}

/**
 * 限流配置
 */
export interface RateLimitConfig {
  capacity: number; // 桶容量
  refillRate: number; // 每秒补充的token数
}
