// src/data-fusion/services/fusion-resource-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * 数据融合资源管理服务
 * 
 * 提供资源限制和保护：
 * - 缓存大小限制（LRU）
 * - 并发限制（Semaphore）
 * - 请求限流（Rate Limiting）
 */
@Injectable()
export class FusionResourceManagerService {
  private readonly logger = new Logger(FusionResourceManagerService.name);

  // LRU缓存实现（简化版）
  private readonly cacheSizeLimit = 1000; // 最大缓存条目数
  private readonly cacheAccessOrder = new Map<string, number>(); // 访问顺序
  private accessCounter = 0;

  // 并发限制（Semaphore）
  private readonly maxConcurrency = 10; // 最大并发数
  private currentConcurrency = 0;
  private readonly concurrencyQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  // 请求限流（Token Bucket）
  private readonly rateLimitTokens = 100; // 令牌桶容量
  private currentTokens = this.rateLimitTokens;
  private readonly tokenRefillRate = 10; // 每秒补充的令牌数
  private lastRefillTime = Date.now();

  /**
   * 检查并更新缓存访问顺序（LRU）
   */
  updateCacheAccess(key: string, cache: Map<string, any>): void {
    // 更新访问顺序
    this.accessCounter++;
    this.cacheAccessOrder.set(key, this.accessCounter);

    // 如果超过大小限制，删除最久未访问的条目
    if (cache.size > this.cacheSizeLimit) {
      this.evictLRUEntries(cache);
    }
  }

  /**
   * 删除最久未访问的条目（LRU）
   */
  private evictLRUEntries(cache: Map<string, any>): void {
    // 找到最久未访问的条目
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.cacheAccessOrder.entries()) {
      if (accessTime < oldestAccess && cache.has(key)) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    // 删除最久未访问的条目
    if (oldestKey) {
      cache.delete(oldestKey);
      this.cacheAccessOrder.delete(oldestKey);
      this.logger.debug(`Evicted LRU cache entry: ${oldestKey}`);
    }
  }

  /**
   * 获取并发执行许可（Semaphore）
   */
  async acquireConcurrency(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.currentConcurrency < this.maxConcurrency) {
        this.currentConcurrency++;
        resolve();
      } else {
        // 加入队列等待
        this.concurrencyQueue.push({ resolve, reject });
        
        // 设置超时（30秒）
        setTimeout(() => {
          const index = this.concurrencyQueue.findIndex(item => item.resolve === resolve);
          if (index >= 0) {
            this.concurrencyQueue.splice(index, 1);
            reject(new Error('Concurrency acquisition timeout'));
          }
        }, 30000);
      }
    });
  }

  /**
   * 释放并发执行许可
   */
  releaseConcurrency(): void {
    this.currentConcurrency--;
    
    // 如果有等待的请求，唤醒一个
    if (this.concurrencyQueue.length > 0) {
      const next = this.concurrencyQueue.shift();
      if (next) {
        this.currentConcurrency++;
        next.resolve();
      }
    }
  }

  /**
   * 检查并消耗限流令牌（Token Bucket）
   */
  async acquireRateLimitToken(): Promise<void> {
    // 补充令牌
    this.refillTokens();

    if (this.currentTokens > 0) {
      this.currentTokens--;
      return;
    }

    // 没有令牌，需要等待
    const waitTime = Math.ceil((1 - this.currentTokens) / this.tokenRefillRate * 1000);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // 等待后再次检查
    this.refillTokens();
    if (this.currentTokens > 0) {
      this.currentTokens--;
    } else {
      throw new Error('Rate limit exceeded');
    }
  }

  /**
   * 补充令牌
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000; // 秒
    const tokensToAdd = Math.floor(elapsed * this.tokenRefillRate);
    
    if (tokensToAdd > 0) {
      this.currentTokens = Math.min(
        this.rateLimitTokens,
        this.currentTokens + tokensToAdd
      );
      this.lastRefillTime = now;
    }
  }

  /**
   * 获取资源使用统计
   */
  getResourceStats(): {
    cacheSize: number;
    currentConcurrency: number;
    maxConcurrency: number;
    queueLength: number;
    currentTokens: number;
    maxTokens: number;
  } {
    return {
      cacheSize: this.cacheAccessOrder.size,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      queueLength: this.concurrencyQueue.length,
      currentTokens: this.currentTokens,
      maxTokens: this.rateLimitTokens,
    };
  }
}
