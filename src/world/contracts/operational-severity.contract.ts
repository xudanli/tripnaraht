/**
 * Typed operational slice contract + unified severity taxonomy (Runtime OS).
 * All domain skills should map into these shapes before arbitration / policy.
 */

/** Unified severity — single lattice for SafeTravel / weather / road / rental / daylight. */
export enum OperationalSeverity {
  INFO = 'INFO',
  CAUTION = 'CAUTION',
  WARNING = 'WARNING',
  DANGEROUS = 'DANGEROUS',
  BLOCKED = 'BLOCKED',
}

export type FreshnessState = 'fresh' | 'stale' | 'expired';

/** Default TTLs (seconds). Tuned for execution safety vs availability. */
export const OPERATIONAL_SLICE_TTL_SECONDS = {
  /** Near-real-time weather / wind evidence */
  weather: 30 * 60,
  /** Road.is / F-status style */
  road: 15 * 60,
  /** SafeTravel RSS — treat as short TTL for gate */
  safetravel: 15 * 60,
  /** Mostly static guidance */
  rental_guidance: 180 * 24 * 60 * 60,
  /** Ephemeris + calendar day — valid for the calendar day, long TTL for cache semantics */
  daylight: 30 * 24 * 60 * 60,
  /** Derived from physical world summary */
  world_physical: 15 * 60,
} as const;

export interface OperationalSlice<T = unknown> {
  type: string;
  severity: OperationalSeverity;
  structured: T;
  generatedAt: number;
  ttlSeconds: number;
  confidence?: number;
  freshness: FreshnessState;
  /** Machine-readable reason codes for arbitration / logs */
  reasonCodes?: string[];
}

export function computeFreshness(generatedAt: number, ttlSeconds: number, nowMs: number = Date.now()): FreshnessState {
  if (ttlSeconds <= 0) return 'fresh';
  const ageSec = (nowMs - generatedAt) / 1000;
  if (ageSec >= ttlSeconds) return 'expired';
  if (ageSec >= ttlSeconds * 0.5) return 'stale';
  return 'fresh';
}

export function operationalSlice<T>(
  type: string,
  severity: OperationalSeverity,
  structured: T,
  ttlSeconds: number,
  nowMs: number = Date.now(),
  extras?: { confidence?: number; reasonCodes?: string[] },
): OperationalSlice<T> {
  const generatedAt = nowMs;
  return {
    type,
    severity,
    structured,
    generatedAt,
    ttlSeconds,
    confidence: extras?.confidence,
    reasonCodes: extras?.reasonCodes,
    freshness: computeFreshness(generatedAt, ttlSeconds),
  };
}

export function maxOperationalSeverity(a: OperationalSeverity, b: OperationalSeverity): OperationalSeverity {
  const order: OperationalSeverity[] = [
    OperationalSeverity.INFO,
    OperationalSeverity.CAUTION,
    OperationalSeverity.WARNING,
    OperationalSeverity.DANGEROUS,
    OperationalSeverity.BLOCKED,
  ];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}
