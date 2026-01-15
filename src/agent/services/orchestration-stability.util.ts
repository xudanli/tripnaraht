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

export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) throw new Error(`TIMEOUT:${label}`);
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT:${label}`)), ms);
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
  keyFor(ctx: StabilityContext): string {
    // Prefer tripId > userId > requestHash
    if (ctx.tripId) return `trip:${ctx.tripId}`;
    if (ctx.userId) return `user:${ctx.userId}`;
    return `req:${ctx.requestHash}`;
  }
  get(ctx: StabilityContext): OrchestrationMode | undefined {
    return this.cache.get(this.keyFor(ctx));
  }
  set(ctx: StabilityContext, mode: OrchestrationMode): void {
    this.cache.set(this.keyFor(ctx), mode);
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
