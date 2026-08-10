/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Stability Layer:
 * - Unified deadline budgeting
 * - Mode lock (sticky routing) to avoid flapping
 * - Circuit breaker per mode
 * - Single fallback guard
 * - Normalized error mapping
 */

export type OrchestrationMode = "CLAUDE_SM" | "CLAUDE_DYNAMIC" | "LEGACY";

export type ResultStatus =
  | "OK"
  | "NEED_MORE_INFO"
  | "NEED_CONSENT"
  | "NEED_CONFIRMATION"
  | "FAILED"
  | "TIMEOUT";

export interface Deadline {
  startTs: number;
  totalMs: number;
  remainingMs(): number;
  elapsedMs(): number;
  isExpired(): boolean;
  clamp(ms: number, minMs?: number): number;
}

export function createDeadline(totalMs: number): Deadline {
  const startTs = Date.now();
  return {
    startTs,
    totalMs,
    remainingMs: () => Math.max(0, totalMs - (Date.now() - startTs)),
    elapsedMs: () => Date.now() - startTs,
    isExpired: () => Date.now() - startTs >= totalMs,
    clamp: (ms: number, minMs = 50) => Math.max(minMs, Math.min(ms, Math.max(0, totalMs - (Date.now() - startTs)))),
  };
}

export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  opts?: { abortController?: AbortController },
): Promise<T> {
  if (ms <= 0) throw new Error(`TIMEOUT:${label}`);
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => {
      opts?.abortController?.abort();
      rej(new Error(`TIMEOUT:${label}`));
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export interface StabilityContext {
  requestId: string;
  userId?: string;
  tripId?: string | null;
  requestHash: string;
  deadline: Deadline;
  traceInfo?: any;
  startTs: number;
  /** P1：与 AgentMemoryContext 对齐，供 ModeLock / 日志 / replay 绑定 */
  snapshotId?: string;
  snapshotVersion?: number;
  /**
   * 未完成规划 operation id。
   * ModeLock 只按 operation 粘模式，不再按 trip session 粘 CLAUDE_SM。
   */
  modeLockOperationId?: string;
}

type CacheKey = string;

class SimpleLruCache<V> {
  private map = new Map<CacheKey, { v: V; at: number }>();
  constructor(private readonly maxSize: number, private readonly ttlMs: number) {}
  get(key: CacheKey): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
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
  delete(key: CacheKey): void {
    this.map.delete(key);
  }
}

export interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  openedAt?: number;
  failures: number;
  lastError?: string;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = { state: "CLOSED", failures: 0 };
  constructor(
    private readonly failThreshold: number,
    private readonly openMs: number
  ) {}

  snapshot(): CircuitBreakerState {
    return { ...this.state };
  }

  canPass(): boolean {
    if (this.state.state === "CLOSED") return true;
    if (this.state.state === "OPEN") {
      const openedAt = this.state.openedAt ?? Date.now();
      if (Date.now() - openedAt >= this.openMs) {
        this.state = { state: "HALF_OPEN", failures: this.state.failures, openedAt };
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN allows one try
  }

  onSuccess(): void {
    this.state = { state: "CLOSED", failures: 0 };
  }

  onFailure(err: any): void {
    const msg = err?.message ? String(err.message) : String(err);
    const failures = (this.state.failures ?? 0) + 1;

    if (this.state.state === "HALF_OPEN") {
      this.state = { state: "OPEN", failures, openedAt: Date.now(), lastError: msg };
      return;
    }

    if (failures >= this.failThreshold) {
      this.state = { state: "OPEN", failures, openedAt: Date.now(), lastError: msg };
    } else {
      this.state = { state: "CLOSED", failures, lastError: msg };
    }
  }
}

export class ModeLock {
  private cache = new SimpleLruCache<OrchestrationMode>(512, 10 * 60 * 1000);
  keyFor(ctx: StabilityContext): string | null {
    /**
     * 仅绑定未完成 planning operation。
     * 禁止 `trip:{id}` 会话级粘性，避免咨询请求被历史 Full Planning 锁回 CLAUDE_SM。
     */
    const op = ctx.modeLockOperationId?.trim();
    if (op) return `op:${op}`;
    return null;
  }
  get(ctx: StabilityContext): OrchestrationMode | undefined {
    const key = this.keyFor(ctx);
    if (!key) return undefined;
    return this.cache.get(key);
  }
  set(ctx: StabilityContext, mode: OrchestrationMode): void {
    const key = this.keyFor(ctx);
    if (!key) return;
    this.cache.set(key, mode);
  }
  clear(ctx: StabilityContext): void {
    const key = this.keyFor(ctx);
    if (!key) return;
    this.cache.delete(key);
  }
}

export interface NormalizedFailure {
  status: ResultStatus;
  errorType: string;
  message: string;
  isTimeout: boolean;
}

export function normalizeError(e: any): NormalizedFailure {
  const msg = e?.message ? String(e.message) : String(e);
  const isTimeout = msg.startsWith("TIMEOUT:") || msg.startsWith("TIMEOUT/");
  if (isTimeout) {
    return {
      status: "TIMEOUT",
      errorType: "TIMEOUT",
      message: "请求超时，请缩小范围或稍后重试。",
      isTimeout: true,
    };
  }
  return {
    status: "FAILED",
    errorType: "INTERNAL_ERROR",
    message: msg || "内部错误",
    isTimeout: false,
  };
}

export class FallbackGuard {
  private used = false;
  tryUse(): boolean {
    if (this.used) return false;
    this.used = true;
    return true;
  }
  usedAlready(): boolean {
    return this.used;
  }
}
