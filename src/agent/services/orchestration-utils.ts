// src/agent/services/orchestration-utils.ts
/**
 * Orchestration Utilities
 * 
 * 提供编排相关的工具类和函数：
 * - Deadline: 全链路超时预算管理
 * - withTimeout: 单步超时控制
 * - runBounded: 有界并发执行
 * - SimpleLruCache: 简单LRU缓存
 */

/**
 * Deadline 类：管理全链路超时预算
 */
export class Deadline {
  private readonly startedAt = Date.now();
  constructor(private readonly totalMs: number) {}
  
  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }
  
  remainingMs(): number {
    return Math.max(0, this.totalMs - this.elapsedMs());
  }
  
  /** 确保传递给下游调用的超时时间不会超过剩余时间，且不小于最小值 */
  clampTimeoutMs(desiredMs: number, minMs = 250): number {
    return Math.max(minMs, Math.min(desiredMs, this.remainingMs()));
  }
  
  isExpired(): boolean {
    return this.remainingMs() <= 0;
  }
}

/**
 * 带超时的 Promise 包装器
 */
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  if (ms <= 0) throw new Error(`TIMEOUT: ${label}`);
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT: ${label}`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * 有界并发执行器（无外部依赖）
 * 在最大并发数限制下并行执行任务
 */
export async function runBounded<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let i = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= tasks.length) return;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 简单 LRU 缓存实现
 */
type CacheKey = string;

export class SimpleLruCache<V> {
  private map = new Map<CacheKey, { v: V; at: number }>();
  
  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
  ) {}

  get(key: CacheKey): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // 刷新 LRU：删除后重新插入
    this.map.delete(key);
    this.map.set(key, { v: hit.v, at: Date.now() });
    return hit.v;
  }

  set(key: CacheKey, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { v: value, at: Date.now() });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value as CacheKey | undefined;
      if (!oldest) break;
      this.map.delete(oldest);
    }
  }
}
