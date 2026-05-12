import type { WorldFact } from '@prisma/client';

/** 事实生命周期 / 新鲜度（可由 Resolver 统一计算，避免各调用方口径不一） */
export interface FactFreshnessMeta {
  /** validTo 已过当前时间 */
  isExpiredByValidTo: boolean;
  /** observedAt 优先，否则 createdAt */
  referenceTimeIso: string;
  ageMs: number;
  /** 简单衰减：7 天内从 1 → 0（可调） */
  freshnessScore: number;
  validFromIso: string | null;
  validToIso: string | null;
}

const DEFAULT_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 统一 freshness 计算（不写库；治理策略后续可配置化）。
 */
export function computeFactFreshness(fact: WorldFact, nowMs = Date.now(), halfLifeMs = DEFAULT_HALF_LIFE_MS): FactFreshnessMeta {
  const validTo = fact.validTo?.getTime();
  const _validFrom = fact.validFrom?.getTime();
  const isExpiredByValidTo = validTo != null && validTo < nowMs;

  const ref = fact.observedAt ?? fact.createdAt;
  const ageMs = Math.max(0, nowMs - ref.getTime());
  const freshnessScore = Math.max(0, 1 - ageMs / halfLifeMs);

  return {
    isExpiredByValidTo,
    referenceTimeIso: ref.toISOString(),
    ageMs,
    freshnessScore,
    validFromIso: fact.validFrom?.toISOString() ?? null,
    validToIso: fact.validTo?.toISOString() ?? null,
  };
}
