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
  /** ISO 8601 — 观测/抓取时间（兼容字段；优先使用 validAt） */
  observedAt: string;
  /** ISO 8601 — 事实失效时间（兼容字段；优先使用 invalidAt） */
  validUntil?: string;
  /**
   * 双时态扩展（Zep/Graphiti 对齐）：
   * - createdAt / expiredAt：系统事务时间（何时写入 / 何时被 supersede）
   * - validAt / invalidAt：世界时间（事实何时成立 / 何时失效）
   */
  createdAt?: string;
  expiredAt?: string;
  validAt?: string;
  invalidAt?: string;
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
export function resolveEvidenceWorldTimes(
  envelope: Pick<EvidenceEnvelope, 'observedAt' | 'validUntil' | 'validAt' | 'invalidAt' | 'expiredAt'>,
): { validFrom: string; validTo?: string; transactionExpiredAt?: string } {
  return {
    validFrom: envelope.validAt ?? envelope.observedAt,
    validTo: envelope.invalidAt ?? envelope.validUntil,
    transactionExpiredAt: envelope.expiredAt,
  };
}

export function assessEvidenceFreshness(
  envelope: Pick<
    EvidenceEnvelope,
    'observedAt' | 'validUntil' | 'validAt' | 'invalidAt' | 'expiredAt' | 'factType'
  >,
  nowMs = Date.now(),
  ttlMs?: number,
): EvidenceFreshnessResult {
  const { validFrom, validTo, transactionExpiredAt } = resolveEvidenceWorldTimes(envelope);
  const observedMs = Date.parse(validFrom);
  if (Number.isNaN(observedMs)) {
    return {
      status: 'UNKNOWN',
      strongJudgmentAllowed: false,
      ageMs: Infinity,
      reason: 'invalid validAt/observedAt',
    };
  }

  const ageMs = Math.max(0, nowMs - observedMs);

  if (transactionExpiredAt) {
    const expiredMs = Date.parse(transactionExpiredAt);
    if (!Number.isNaN(expiredMs) && expiredMs < nowMs) {
      return {
        status: 'EXPIRED',
        strongJudgmentAllowed: false,
        ageMs,
        reason: 'expiredAt passed (superseded in system)',
      };
    }
  }

  if (validTo) {
    const validUntilMs = Date.parse(validTo);
    if (!Number.isNaN(validUntilMs) && validUntilMs < nowMs) {
      return {
        status: 'EXPIRED',
        strongJudgmentAllowed: false,
        ageMs,
        reason: 'invalidAt/validUntil passed',
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
