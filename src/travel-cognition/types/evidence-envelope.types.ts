/**
 * EvidenceEnvelope — 外部事实的统一可信度包装。
 * 所有强判断必须能追溯到带来源、时效与置信度的事实。
 */

import type { TravelEntityRef } from './travel-entity-ref.types';

export type TravelFactType =
  | 'WEATHER'
  | 'ROAD'
  | 'OPENING_HOURS'
  | 'SAFETY_ALERT'
  | 'TRANSPORT_TIME'
  | 'FLIGHT_STATUS';

export interface EvidenceEnvelope<T = unknown> {
  factType: TravelFactType;
  entityRef: TravelEntityRef;
  value: T;
  /** 数据源标识（adapter 名、dataset、provider） */
  source: string;
  /** ISO 8601 — 观测/抓取时间 */
  observedAt: string;
  /** ISO 8601 — 事实失效时间（可选；预报/路况类通常必填） */
  validUntil?: string;
  /** 0..1 */
  confidence: number;
}

export type EvidenceFreshnessStatus = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN';

export interface EvidenceFreshnessResult {
  status: EvidenceFreshnessStatus;
  /** 是否仍可用于强判断（blocker / must 级结论） */
  strongJudgmentAllowed: boolean;
  ageMs: number;
  reason?: string;
}

/** 各 factType 默认强判断 TTL（毫秒）；治理策略可后续配置化 */
export const DEFAULT_STRONG_JUDGMENT_TTL_MS: Record<TravelFactType, number> = {
  WEATHER: 3 * 60 * 60 * 1000,
  ROAD: 2 * 60 * 60 * 1000,
  OPENING_HOURS: 7 * 24 * 60 * 60 * 1000,
  SAFETY_ALERT: 6 * 60 * 60 * 1000,
  TRANSPORT_TIME: 24 * 60 * 60 * 1000,
  FLIGHT_STATUS: 30 * 60 * 1000,
};

/**
 * 校验证据是否仍可用于强判断。
 * 过期事实只能用于弱提示，不能支撑 blocker 级结论。
 */
export function assessEvidenceFreshness(
  envelope: Pick<EvidenceEnvelope, 'observedAt' | 'validUntil' | 'factType'>,
  nowMs = Date.now(),
  ttlMs?: number,
): EvidenceFreshnessResult {
  const observedMs = Date.parse(envelope.observedAt);
  if (Number.isNaN(observedMs)) {
    return {
      status: 'UNKNOWN',
      strongJudgmentAllowed: false,
      ageMs: Infinity,
      reason: 'invalid observedAt',
    };
  }

  const ageMs = Math.max(0, nowMs - observedMs);

  if (envelope.validUntil) {
    const validUntilMs = Date.parse(envelope.validUntil);
    if (!Number.isNaN(validUntilMs) && validUntilMs < nowMs) {
      return {
        status: 'EXPIRED',
        strongJudgmentAllowed: false,
        ageMs,
        reason: 'validUntil passed',
      };
    }
  }

  const limit = ttlMs ?? DEFAULT_STRONG_JUDGMENT_TTL_MS[envelope.factType];
  if (ageMs > limit) {
    return {
      status: 'STALE',
      strongJudgmentAllowed: false,
      ageMs,
      reason: `older than ${limit}ms TTL for ${envelope.factType}`,
    };
  }

  return { status: 'FRESH', strongJudgmentAllowed: true, ageMs };
}
