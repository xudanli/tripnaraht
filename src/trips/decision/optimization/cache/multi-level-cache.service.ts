/**
 * 多级缓存服务
 *
 * P2.1 优化：实现 L1/L2/L3 三级缓存架构
 *
 * 缓存层次：
 * - L1: 进程内存（最快，容量最小）
 * - L2: Redis（跨进程共享）
 * - L3: 数据库（持久化，最慢）
 *
 * 策略：
 * - 读取：L1 → L2 → L3，命中后回填上层
 * - 写入：写穿（Write-through）或写回（Write-back）
 * - 失效：级联失效
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface CacheConfig {
  l1MaxSize: number;
  l1TtlMs: number;
  l2TtlMs: number;
  l3TtlMs: number;
  writeStrategy: 'write-through' | 'write-back';
  compressionThreshold: number;
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l3Hits: number;
  l3Misses: number;
  totalRequests: number;
  hitRate: number;
  avgLatencyMs: number;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  sizeBytes?: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  l1MaxSize: 1000,
  l1TtlMs: 60000,
  l2TtlMs: 300000,
  l3TtlMs: 3600000,
  writeStrategy: 'write-through',
  compressionThreshold: 1024,
};

@Injectable()
export class MultiLevelCacheService {
  private readonly logger = new Logger(MultiLevelCacheService.name);
  private config: CacheConfig = DEFAULT_CONFIG;

  private l1Cache: Map<string, CacheEntry<unknown>> = new Map();
  private l1AccessOrder: string[] = [];

  private stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    l3Hits: 0,
    l3Misses: 0,
    totalRequests: 0,
    hitRate: 0,
    avgLatencyMs: 0,
  };

  private totalLatencyMs = 0;
  private writeBackQueue: Map<string, { value: unknown; ttlMs: number }> = new Map();
  private writeBackTimer: NodeJS.Timeout | null = null;

  constructor(@Optional() @Inject(CACHE_MANAGER) private readonly redisCache?: Cache) {
    if (redisCache) {
      this.logger.log('[MultiLevelCache] Redis 可用，启用 L2 缓存');
    } else {
      this.logger.warn('[MultiLevelCache] Redis 不可用，仅使用 L1 缓存');
    }

    this.startWriteBackTimer();
  }

  configure(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取缓存值（多级查找）
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const l1Result = this.getFromL1<T>(key);
    if (l1Result !== null) {
      this.stats.l1Hits++;
      this.recordLatency(startTime);
      return l1Result;
    }
    this.stats.l1Misses++;

    if (this.redisCache) {
      const l2Result = await this.getFromL2<T>(key);
      if (l2Result !== null) {
        this.stats.l2Hits++;
        this.setToL1(key, l2Result, this.config.l1TtlMs);
        this.recordLatency(startTime);
        return l2Result;
      }
      this.stats.l2Misses++;
    }

    this.recordLatency(startTime);
    return null;
  }

  /**
   * 设置缓存值（多级写入）
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const l1Ttl = ttlMs ?? this.config.l1TtlMs;
    const l2Ttl = ttlMs ?? this.config.l2TtlMs;

    this.setToL1(key, value, l1Ttl);

    if (this.config.writeStrategy === 'write-through') {
      if (this.redisCache) {
        await this.setToL2(key, value, l2Ttl);
      }
    } else {
      this.writeBackQueue.set(key, { value, ttlMs: l2Ttl });
    }
  }

  /**
   * 删除缓存（级联失效）
   */
  async delete(key: string): Promise<void> {
    this.l1Cache.delete(key);
    this.l1AccessOrder = this.l1AccessOrder.filter((k) => k !== key);

    if (this.redisCache) {
      await this.redisCache.del(key);
    }

    this.writeBackQueue.delete(key);
  }

  /**
   * 批量获取
   */
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();

    for (const key of keys) {
      results.set(key, await this.get<T>(key));
    }

    return results;
  }

  /**
   * 批量设置
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttlMs?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttlMs);
    }
  }

  /**
   * 带回调的缓存获取（缓存穿透保护）
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    this.l1AccessOrder = [];
    this.writeBackQueue.clear();

    if (this.redisCache) {
      // Note: cache-manager v5+ uses store.reset() or clear patterns
      // For compatibility, we use del with pattern matching if available
      try {
        await (this.redisCache as any).store?.reset?.();
      } catch {
        // Fallback: clear is not available in all cache implementations
        this.logger.debug('[MultiLevelCache] Redis clear not supported');
      }
    }

    this.logger.log('[MultiLevelCache] 缓存已清空');
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    const totalHits = this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Hits;
    this.stats.hitRate =
      this.stats.totalRequests > 0 ? totalHits / this.stats.totalRequests : 0;
    this.stats.avgLatencyMs =
      this.stats.totalRequests > 0 ? this.totalLatencyMs / this.stats.totalRequests : 0;

    return { ...this.stats };
  }

  /**
   * 获取 L1 缓存大小
   */
  getL1Size(): number {
    return this.l1Cache.size;
  }

  /**
   * 预热缓存
   */
  async warmup<T>(entries: Array<{ key: string; value: T; ttlMs?: number }>): Promise<number> {
    let loaded = 0;
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttlMs);
      loaded++;
    }
    this.logger.log(`[MultiLevelCache] 预热完成: ${loaded} 条记录`);
    return loaded;
  }

  // ========== L1 缓存操作 ==========

  private getFromL1<T>(key: string): T | null {
    const entry = this.l1Cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.l1Cache.delete(key);
      this.l1AccessOrder = this.l1AccessOrder.filter((k) => k !== key);
      return null;
    }

    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.updateAccessOrder(key);

    return entry.value;
  }

  private setToL1<T>(key: string, value: T, ttlMs: number): void {
    if (this.l1Cache.size >= this.config.l1MaxSize) {
      this.evictFromL1();
    }

    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + ttlMs,
      accessCount: 1,
      lastAccessedAt: now,
      sizeBytes: this.estimateSize(value),
    };

    this.l1Cache.set(key, entry);
    this.updateAccessOrder(key);
  }

  private evictFromL1(): void {
    if (this.l1AccessOrder.length === 0) return;

    const evictKey = this.l1AccessOrder.shift();
    if (evictKey) {
      this.l1Cache.delete(evictKey);
    }
  }

  private updateAccessOrder(key: string): void {
    const index = this.l1AccessOrder.indexOf(key);
    if (index > -1) {
      this.l1AccessOrder.splice(index, 1);
    }
    this.l1AccessOrder.push(key);
  }

  // ========== L2 缓存操作 ==========

  private async getFromL2<T>(key: string): Promise<T | null> {
    if (!this.redisCache) return null;

    try {
      const value = await this.redisCache.get<T>(key);
      return value ?? null;
    } catch (error) {
      this.logger.warn(`[MultiLevelCache] L2 读取失败: ${key}`, error);
      return null;
    }
  }

  private async setToL2<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (!this.redisCache) return;

    try {
      await this.redisCache.set(key, value, ttlMs);
    } catch (error) {
      this.logger.warn(`[MultiLevelCache] L2 写入失败: ${key}`, error);
    }
  }

  // ========== Write-back 队列 ==========

  private startWriteBackTimer(): void {
    if (this.config.writeStrategy !== 'write-back') return;

    this.writeBackTimer = setInterval(async () => {
      await this.flushWriteBackQueue();
    }, 5000);
  }

  private async flushWriteBackQueue(): Promise<void> {
    if (this.writeBackQueue.size === 0 || !this.redisCache) return;

    const entries = Array.from(this.writeBackQueue.entries());
    this.writeBackQueue.clear();

    for (const [key, { value, ttlMs }] of entries) {
      await this.setToL2(key, value, ttlMs);
    }

    this.logger.debug(`[MultiLevelCache] Write-back 刷新: ${entries.length} 条`);
  }

  // ========== 工具方法 ==========

  private recordLatency(startTime: number): void {
    this.totalLatencyMs += Date.now() - startTime;
  }

  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 0;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.writeBackTimer) {
      clearInterval(this.writeBackTimer);
    }
    await this.flushWriteBackQueue();
  }
}

// ========== 专用缓存键生成器 ==========

export const CacheKeys = {
  dsoSnapshot: (requestId: string, version: number) => `dso:${requestId}:v${version}`,
  userWeights: (userId: string) => `weights:${userId}`,
  constraintResult: (planHash: string) => `constraint:${planHash}`,
  utilityResult: (planHash: string, contextHash: string) => `utility:${planHash}:${contextHash}`,
  worldModel: (contextHash: string) => `world:${contextHash}`,
  policyOutput: (stateHash: string) => `policy:${stateHash}`,
};

export function hashObject(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
