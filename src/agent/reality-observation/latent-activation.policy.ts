/**
 * Latent Activation Policy — 隐式假设如何进入系统。
 *
 * 原则：显式/推导定义真相；隐式只补充理解。
 * Gate / Execute / ASK_TRIP_QUESTION 只消费 Canonical，永不注入 latent 全量。
 */

import type {
  LatentHypothesis,
  LatentUsagePolicy,
  RorRealitySnapshot,
} from './reality-observation.types';

/** 消费方 / 下游用途 */
export type LatentConsumer =
  | 'GATE'
  | 'EXECUTE'
  | 'ASK_TRIP_QUESTION'
  | 'CRE_SLIM'
  | 'EXPLAIN'
  | 'SUGGEST'
  | 'RANKING'
  | 'OBSERVABILITY';

/** 各消费方允许的最高 usagePolicy（含）；未列出则禁止一切 latent */
const CONSUMER_MAX_POLICY: Record<LatentConsumer, LatentUsagePolicy | null> = {
  GATE: null,
  EXECUTE: null,
  ASK_TRIP_QUESTION: null,
  CRE_SLIM: null,
  EXPLAIN: 'HINT',
  SUGGEST: 'SOFT_CONSTRAINT',
  RANKING: 'RANKING_ONLY',
  OBSERVABILITY: 'CONFIRM_REQUIRED',
};

const POLICY_RANK: Record<LatentUsagePolicy, number> = {
  HINT: 1,
  RANKING_ONLY: 2,
  SOFT_CONSTRAINT: 3,
  CONFIRM_REQUIRED: 4,
};

export function latentPolicyRank(policy: LatentUsagePolicy): number {
  return POLICY_RANK[policy];
}

/**
 * 某条假设是否允许被该消费方使用。
 * - 安全硬约束路径（GATE/EXECUTE/ASK/CRE_SLIM）一律 false
 * - CONFIRM_REQUIRED 且未 CONFIRMED → 不可自动使用（即使 SUGGEST）
 * - EXPIRED / REJECTED → false
 * - MOMENT/DAY 不得被当作 LONG_TERM
 */
export function canActivateLatentForConsumer(
  hypothesis: LatentHypothesis,
  consumer: LatentConsumer,
  nowMs: number = Date.now(),
): boolean {
  const max = CONSUMER_MAX_POLICY[consumer];
  if (max == null) return false;

  if (hypothesis.status === 'REJECTED' || hypothesis.status === 'EXPIRED') {
    return false;
  }
  if (hypothesis.validUntil) {
    const until = Date.parse(hypothesis.validUntil);
    if (!Number.isNaN(until) && until < nowMs) return false;
  }

  if (
    hypothesis.usagePolicy === 'CONFIRM_REQUIRED' &&
    hypothesis.status !== 'CONFIRMED'
  ) {
    return false;
  }

  if (latentPolicyRank(hypothesis.usagePolicy) > latentPolicyRank(max)) {
    return false;
  }

  /** 安全：隐式不得单独成为安全硬 BLOCK（由 consumer=GATE 已禁） */
  return true;
}

/** 过滤出当前消费方可用的隐式假设（默认不提升 status） */
export function selectLatentForConsumer(
  hypotheses: LatentHypothesis[],
  consumer: LatentConsumer,
  nowMs?: number,
): LatentHypothesis[] {
  return hypotheses.filter((h) => canActivateLatentForConsumer(h, consumer, nowMs));
}

/**
 * 禁止将 latent 提升为硬约束 / 永久画像 的策略校验。
 */
export function assertLatentNotUsedAsHardConstraint(
  consumer: LatentConsumer,
  hypotheses: LatentHypothesis[],
): { ok: boolean; violations: string[] } {
  if (consumer === 'GATE' || consumer === 'EXECUTE') {
    const leaked = hypotheses.filter((h) =>
      canActivateLatentForConsumer(h, consumer),
    );
    return {
      ok: leaked.length === 0,
      violations: leaked.map((h) => h.key),
    };
  }
  const longTermPollution = hypotheses.filter(
    (h) =>
      h.scope === 'LONG_TERM' &&
      (h.scope as string) &&
      (h.validUntil == null || Date.parse(h.validUntil) - Date.now() > 90 * 86400_000) &&
      h.generatedBy === 'RULE' &&
      h.confidence < 0.85 &&
      h.status === 'ACTIVE',
  );
  return {
    ok: true,
    violations: longTermPollution.map((h) => `long_term_risk:${h.key}`),
  };
}

/** CRE / ASK 路径：是否允许携带任何 latent */
export function crePathAllowsLatent(creOperation?: string | null): boolean {
  if (!creOperation) return false;
  return creOperation !== 'ASK_TRIP_QUESTION' && creOperation !== 'GENERIC_UNKNOWN';
}

/**
 * 下游装载视图：Canonical only（无 latent 全量）。
 */
export function buildCanonicalOnlyLoadView(snapshot: RorRealitySnapshot): {
  layer: 'CANONICAL_ONLY';
  observedFacts: RorRealitySnapshot['observedFacts'];
  derivedFacts: RorRealitySnapshot['derivedFacts'];
  unknowns: RorRealitySnapshot['unknowns'];
  decisionSnapshot: RorRealitySnapshot['decisionSnapshot'];
  latentHypotheses: [];
  latentInjected: false;
} {
  return {
    layer: 'CANONICAL_ONLY',
    observedFacts: snapshot.observedFacts,
    derivedFacts: snapshot.derivedFacts,
    unknowns: snapshot.unknowns.filter((u) => u.gapKind !== 'ASK_USER' || u.blocking),
    decisionSnapshot: snapshot.decisionSnapshot,
    latentHypotheses: [],
    latentInjected: false,
  };
}

/**
 * Suggest/Ranking 装载：Canonical + 策略允许的 latent 子集（非全量）。
 */
export function buildSuggestLoadView(
  snapshot: RorRealitySnapshot,
  consumer: Extract<LatentConsumer, 'SUGGEST' | 'RANKING' | 'EXPLAIN'> = 'SUGGEST',
): {
  layer: 'CANONICAL_PLUS_ACTIVATED_LATENT';
  observedFacts: RorRealitySnapshot['observedFacts'];
  derivedFacts: RorRealitySnapshot['derivedFacts'];
  decisionSnapshot: RorRealitySnapshot['decisionSnapshot'];
  latentHypotheses: LatentHypothesis[];
  latentInjected: boolean;
} {
  const activated = selectLatentForConsumer(snapshot.latentHypotheses, consumer);
  return {
    layer: 'CANONICAL_PLUS_ACTIVATED_LATENT',
    observedFacts: snapshot.observedFacts,
    derivedFacts: snapshot.derivedFacts,
    decisionSnapshot: snapshot.decisionSnapshot,
    latentHypotheses: activated,
    latentInjected: activated.length > 0,
  };
}
