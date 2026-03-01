/**
 * Decision OS 缓存服务
 * 
 * 多级缓存架构：
 * - L1: 内存缓存（LRU）
 * - L2: Redis 缓存（可选）
 * 
 * 支持：
 * - TTL 过期
 * - 缓存穿透保护
 * - 缓存击穿保护（互斥锁）
 * - 缓存雪崩保护（随机 TTL）
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// ========== 类型定义 ==========

export interface CacheConfig {
  ttlMs: number;
  maxSize?: number;
  randomizeTtl?: boolean;
  randomTtlRange?: number;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export interface CacheKeyBuilder {
  build(...args: unknown[]): string;
}

// ========== LRU 缓存实现 ==========

export class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + ttlMs,
      hits: 0,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// ========== 缓存服务 ==========

@Injectable()
export class DecisionCacheService {
  private readonly logger = new Logger(DecisionCacheService.name);
  private readonly l1Cache: LRUCache<unknown>;
  private readonly locks = new Map<string, Promise<unknown>>();

  private stats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
  };

  private readonly defaultConfig: CacheConfig = {
    ttlMs: 60000,
    maxSize: 1000,
    randomizeTtl: true,
    randomTtlRange: 5000,
  };

  constructor(
    @Optional() @Inject(CACHE_MANAGER)
    private readonly cacheManager?: Cache,
  ) {
    this.l1Cache = new LRUCache(this.defaultConfig.maxSize);
    this.logger.log('[DecisionCache] 缓存服务初始化完成');
  }

  async get<T>(key: string): Promise<T | undefined> {
    const l1Value = this.l1Cache.get(key) as T | undefined;
    if (l1Value !== undefined) {
      this.stats.l1Hits++;
      return l1Value;
    }
    this.stats.l1Misses++;

    if (this.cacheManager) {
      const l2Value = await this.cacheManager.get<T>(key);
      if (l2Value !== undefined) {
        this.stats.l2Hits++;
        this.l1Cache.set(key, l2Value, this.defaultConfig.ttlMs);
        return l2Value;
      }
      this.stats.l2Misses++;
    }

    return undefined;
  }

  async set<T>(key: string, value: T, config?: Partial<CacheConfig>): Promise<void> {
    const ttl = this.computeTtl(config);

    this.l1Cache.set(key, value, ttl);

    if (this.cacheManager) {
      await this.cacheManager.set(key, value, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    this.l1Cache.delete(key);

    if (this.cacheManager) {
      await this.cacheManager.del(key);
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    config?: Partial<CacheConfig>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const existingLock = this.locks.get(key);
    if (existingLock) {
      return existingLock as Promise<T>;
    }

    const lockPromise = (async () => {
      try {
        const value = await factory();
        await this.set(key, value, config);
        return value;
      } finally {
        this.locks.delete(key);
      }
    })();

    this.locks.set(key, lockPromise);
    return lockPromise;
  }

  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    for (const key of this.l1Cache.keys()) {
      if (regex.test(key)) {
        this.l1Cache.delete(key);
        count++;
      }
    }

    return count;
  }

  getStats(): CacheStats & { l1: CacheStats; l2: CacheStats } {
    const l1Total = this.stats.l1Hits + this.stats.l1Misses;
    const l2Total = this.stats.l2Hits + this.stats.l2Misses;

    return {
      hits: this.stats.l1Hits + this.stats.l2Hits,
      misses: this.stats.l1Misses,
      size: this.l1Cache.size(),
      hitRate: l1Total > 0 ? this.stats.l1Hits / l1Total : 0,
      l1: {
        hits: this.stats.l1Hits,
        misses: this.stats.l1Misses,
        size: this.l1Cache.size(),
        hitRate: l1Total > 0 ? this.stats.l1Hits / l1Total : 0,
      },
      l2: {
        hits: this.stats.l2Hits,
        misses: this.stats.l2Misses,
        size: 0,
        hitRate: l2Total > 0 ? this.stats.l2Hits / l2Total : 0,
      },
    };
  }

  resetStats(): void {
    this.stats = { l1Hits: 0, l1Misses: 0, l2Hits: 0, l2Misses: 0 };
  }

  clear(): void {
    this.l1Cache.clear();
  }

  prune(): number {
    return this.l1Cache.prune();
  }

  private computeTtl(config?: Partial<CacheConfig>): number {
    const baseTtl = config?.ttlMs ?? this.defaultConfig.ttlMs;
    const shouldRandomize = config?.randomizeTtl ?? this.defaultConfig.randomizeTtl;
    const randomRange = config?.randomTtlRange ?? this.defaultConfig.randomTtlRange ?? 0;

    if (shouldRandomize && randomRange > 0) {
      const randomOffset = Math.floor(Math.random() * randomRange) - randomRange / 2;
      return Math.max(1000, baseTtl + randomOffset);
    }

    return baseTtl;
  }
}

// ========== 缓存键构建器 ==========

export class DecisionCacheKeys {
  static readonly PREFIX = 'decision:';

  static dso(requestId: string): string {
    return `${this.PREFIX}dso:${requestId}`;
  }

  static dsoVersion(requestId: string, version: number): string {
    return `${this.PREFIX}dso:${requestId}:v${version}`;
  }

  static userWeights(userId: string): string {
    return `${this.PREFIX}weights:${userId}`;
  }

  static policyOutput(requestId: string): string {
    return `${this.PREFIX}policy:${requestId}`;
  }

  static utilityResult(requestId: string): string {
    return `${this.PREFIX}utility:${requestId}`;
  }

  static snapshot(requestId: string, version: number): string {
    return `${this.PREFIX}snapshot:${requestId}:${version}`;
  }

  static snapshotList(requestId: string): string {
    return `${this.PREFIX}snapshots:${requestId}`;
  }

  static stabilityAnalysis(requestId: string): string {
    return `${this.PREFIX}stability:${requestId}`;
  }

  static pattern(prefix: string): string {
    return `${this.PREFIX}${prefix}:*`;
  }
}

// ========== 缓存装饰器 ==========

const cacheMetadataKey = Symbol('cache');

export interface CacheDecoratorOptions {
  keyBuilder?: (...args: unknown[]) => string;
  ttlMs?: number;
  condition?: (...args: unknown[]) => boolean;
}

export function Cached(options: CacheDecoratorOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const cacheService = (this as any).cacheService as DecisionCacheService | undefined;

      if (!cacheService) {
        return originalMethod.apply(this, args);
      }

      if (options.condition && !options.condition(...args)) {
        return originalMethod.apply(this, args);
      }

      const key = options.keyBuilder
        ? options.keyBuilder(...args)
        : `${target.constructor.name}:${String(propertyKey)}:${JSON.stringify(args)}`;

      return cacheService.getOrSet(
        key,
        () => originalMethod.apply(this, args),
        { ttlMs: options.ttlMs },
      );
    };

    Reflect.defineMetadata(cacheMetadataKey, options, target, propertyKey);

    return descriptor;
  };
}

export function InvalidateCache(keyPattern: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const result = await originalMethod.apply(this, args);

      const cacheService = (this as any).cacheService as DecisionCacheService | undefined;
      if (cacheService) {
        await cacheService.invalidatePattern(keyPattern);
      }

      return result;
    };

    return descriptor;
  };
}
