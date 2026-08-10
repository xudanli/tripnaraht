/**
 * Memory Candidate → QUALIFIED →（review）→ ACTIVE / Profile。
 *
 * CANDIDATE 永不进 Decision Context。
 * 只有：confidence > threshold + multiple episodes + no contradiction
 * + 非情境主导 才能 QUALIFIED。
 */

import {
  ATTRIBUTION_PROMOTION_GATE,
  type DecisionAttributionConfidenceV1,
  type PromotionGateResult,
} from './decision-attribution-confidence.types';
import type { CausalAttributionV1 } from './causal-attribution.types';

export function evaluateAttributionPromotion(
  attr: DecisionAttributionConfidenceV1,
  gate: typeof ATTRIBUTION_PROMOTION_GATE = ATTRIBUTION_PROMOTION_GATE,
): PromotionGateResult {
  const evidenceCount = attr.evidence.length;
  const confidence = attr.confidence;

  if (
    attr.status === 'BLOCKED_CONTRADICTION' ||
    attr.status === 'BLOCKED_SITUATIONAL' ||
    attr.status === 'REJECTED'
  ) {
    return {
      promote: false,
      reason: `status=${attr.status}`,
      confidence,
      evidenceCount,
    };
  }

  if (
    gate.blockOnContradiction &&
    (attr.contradictionEpisodeIds?.length ?? 0) > 0
  ) {
    return {
      promote: false,
      reason: 'contradiction_present',
      confidence,
      evidenceCount,
    };
  }

  const prefSignal = attr.causalAttribution?.userPreferenceSignal;
  if (prefSignal?.situationalDominant) {
    return {
      promote: false,
      reason: 'situational_dominant_not_preference',
      confidence,
      evidenceCount,
    };
  }
  if (
    prefSignal &&
    prefSignal.confidence < gate.minUserPreferenceSignal
  ) {
    return {
      promote: false,
      reason: `user_preference_signal_too_low:${prefSignal.confidence}`,
      confidence,
      evidenceCount,
    };
  }

  if (evidenceCount < gate.minEpisodes) {
    return {
      promote: false,
      reason: `need_more_episodes:${evidenceCount}/${gate.minEpisodes}`,
      confidence,
      evidenceCount,
    };
  }

  if (confidence < gate.minConfidence) {
    return {
      promote: false,
      reason: `confidence_below_threshold:${confidence}/${gate.minConfidence}`,
      confidence,
      evidenceCount,
    };
  }

  const maxWeight = Math.max(...attr.evidence.map((e) => e.weight), 0);
  if (maxWeight > gate.maxSingleEpisodeWeight) {
    return {
      promote: false,
      reason: `single_episode_weight_too_high:${maxWeight}`,
      confidence,
      evidenceCount,
    };
  }

  return {
    promote: true,
    confidence,
    evidenceCount,
    nextLifecycle: 'QUALIFIED',
  };
}

/**
 * 合并同 predicate 的多次归因证据（保守：矛盾 / 情境主导则降置信）。
 */
export function accumulateAttributionEvidence(input: {
  previous?: DecisionAttributionConfidenceV1 | null;
  candidateType: string;
  predicate: string;
  value: unknown;
  episodeId: string;
  decisionId?: string | null;
  episodeWeight?: number;
  contradicts?: boolean;
  causalAttribution?: CausalAttributionV1 | null;
  nowIso?: string;
}): DecisionAttributionConfidenceV1 {
  const now = input.nowIso ?? new Date().toISOString();
  const weight = Math.min(
    input.episodeWeight ?? 0.3,
    ATTRIBUTION_PROMOTION_GATE.maxSingleEpisodeWeight,
  );

  const prev = input.previous;
  const evidence = [...(prev?.evidence ?? [])];
  if (!evidence.some((e) => e.episodeId === input.episodeId)) {
    evidence.push({
      episodeId: input.episodeId,
      weight,
      decisionId: input.decisionId ?? null,
    });
  }

  let contradictionEpisodeIds = [...(prev?.contradictionEpisodeIds ?? [])];
  let confidence = prev?.confidence ?? 0.42;
  const causal =
    input.causalAttribution ?? prev?.causalAttribution ?? null;

  if (causal?.userPreferenceSignal.situationalDominant) {
    confidence = Math.min(confidence, causal.userPreferenceSignal.confidence);
    return {
      schemaId: 'tripnara.decision_attribution_confidence@v1',
      version: 1,
      candidateMemory: {
        type: input.candidateType,
        predicate: input.predicate,
        value: input.value,
      },
      confidence,
      evidence,
      status: 'BLOCKED_SITUATIONAL',
      lifecycle: 'CANDIDATE',
      causalAttribution: causal,
      contradictionEpisodeIds,
      blockedReason: 'environment_or_situation_explains_outcome',
      updatedAt: now,
    };
  }

  if (input.contradicts) {
    contradictionEpisodeIds = Array.from(
      new Set([...contradictionEpisodeIds, input.episodeId]),
    );
    confidence = Math.max(0.1, confidence - 0.2);
  } else if (prev && String(prev.candidateMemory.value) !== String(input.value)) {
    contradictionEpisodeIds = Array.from(
      new Set([...contradictionEpisodeIds, input.episodeId]),
    );
    confidence = Math.max(0.1, confidence - 0.15);
  } else {
    confidence = Math.min(0.85, confidence + weight * 0.35);
  }

  const base: DecisionAttributionConfidenceV1 = {
    schemaId: 'tripnara.decision_attribution_confidence@v1',
    version: 1,
    candidateMemory: {
      type: input.candidateType,
      predicate: input.predicate,
      value: input.value,
    },
    confidence,
    evidence,
    status: 'CANDIDATE',
    lifecycle: 'CANDIDATE',
    causalAttribution: causal,
    contradictionEpisodeIds,
    blockedReason: null,
    updatedAt: now,
  };

  if (contradictionEpisodeIds.length > 0) {
    return {
      ...base,
      status: 'BLOCKED_CONTRADICTION',
      lifecycle: 'CANDIDATE',
      blockedReason: 'contradictory_episodes',
    };
  }

  const gate = evaluateAttributionPromotion(base);
  if (gate.promote === true) {
    return {
      ...base,
      status: 'QUALIFIED',
      lifecycle: 'QUALIFIED',
      blockedReason: null,
    };
  }

  return {
    ...base,
    status: evidence.length >= 2 ? 'EVIDENCE_ACCUMULATING' : 'CANDIDATE',
    lifecycle: 'CANDIDATE',
    blockedReason: gate.reason,
  };
}
