/**
 * Phase 4 P1 — Outcome Review for Silent Learning.
 * 回答：哪些建议没发出去，但其实应该发？
 */

import type { ProactiveSilentLearningV1 } from '../intervention/proactive-silent-learning.types';
import type { MemoryEventV1 } from '../../../travel-memory/types/memory-event.types';
import type { ProactiveSilentLearningMemoryValueV1 } from './ingest-proactive-silent-learning.util';

export const PROACTIVE_SILENT_OUTCOME_REVIEW_SCHEMA =
  'nara.proactive_silent_outcome_review@v1' as const;

export type ProactiveSilentOutcomeVerdict =
  | 'SHOULD_HAVE_NOTIFIED'
  | 'CORRECTLY_SILENT'
  | 'INCONCLUSIVE';

export type ProactiveSilentOutcomeReviewV1 = {
  schemaId: typeof PROACTIVE_SILENT_OUTCOME_REVIEW_SCHEMA;
  version: 1;
  memoryEventId: string;
  tripId: string;
  signalEventId: string;
  caseId: string | null;
  originalInterventionValue: number | null;
  originalThreshold: number | null;
  verdict: ProactiveSilentOutcomeVerdict;
  signals: {
    userAskedSameQuestion?: boolean;
    laterAcceptedSimilarCard?: boolean;
    regretReported?: boolean;
    nearMissValueGap?: number;
  };
  rationaleZh: string;
  reviewedAt: string;
  reviewer: 'SYSTEM_HEURISTIC' | 'HUMAN' | 'SHADOW_REPLAY';
};

/**
 * Heuristic Outcome Review — for Shadow / offline threshold tuning.
 */
export function evaluateSilentLearningOutcomeHeuristic(input: {
  silent: ProactiveSilentLearningV1;
  memoryEventId: string;
  userAskedSameQuestionWithinWindow?: boolean;
  laterAcceptedSimilarCard?: boolean;
  regretReported?: boolean;
  reviewedAt?: string;
}): ProactiveSilentOutcomeReviewV1 {
  const value = input.silent.interventionValue ?? null;
  const threshold = input.silent.threshold ?? null;
  const nearMiss =
    value != null && threshold != null ? threshold - value : undefined;

  let verdict: ProactiveSilentOutcomeVerdict = 'INCONCLUSIVE';
  const parts: string[] = [];

  if (input.regretReported || input.laterAcceptedSimilarCard) {
    verdict = 'SHOULD_HAVE_NOTIFIED';
    parts.push('用户后续出现相似接受或后悔信号');
  } else if (input.userAskedSameQuestionWithinWindow) {
    verdict = 'SHOULD_HAVE_NOTIFIED';
    parts.push('用户主动追问同类问题（抑制可能过严）');
  } else if (
    nearMiss != null &&
    nearMiss >= 0 &&
    nearMiss <= 0.05 &&
    input.userAskedSameQuestionWithinWindow === false
  ) {
    verdict = 'CORRECTLY_SILENT';
    parts.push('接近阈值但无用户追问，抑制合理');
  } else if (input.userAskedSameQuestionWithinWindow === false) {
    verdict = 'CORRECTLY_SILENT';
    parts.push('窗口内无追问，暂判正确沉默');
  } else {
    parts.push('证据不足，待 Shadow 回放或人工抽检');
  }

  return {
    schemaId: PROACTIVE_SILENT_OUTCOME_REVIEW_SCHEMA,
    version: 1,
    memoryEventId: input.memoryEventId,
    tripId: input.silent.tripId,
    signalEventId: input.silent.signalEventId,
    caseId: input.silent.caseId,
    originalInterventionValue: value,
    originalThreshold: threshold,
    verdict,
    signals: {
      userAskedSameQuestion: input.userAskedSameQuestionWithinWindow,
      laterAcceptedSimilarCard: input.laterAcceptedSimilarCard,
      regretReported: input.regretReported,
      nearMissValueGap: nearMiss,
    },
    rationaleZh: parts.join('；'),
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
    reviewer: 'SYSTEM_HEURISTIC',
  };
}

export function reviewSilentLearningMemoryEvent(
  event: MemoryEventV1,
  hints: {
    userAskedSameQuestionWithinWindow?: boolean;
    laterAcceptedSimilarCard?: boolean;
    regretReported?: boolean;
    reviewedAt?: string;
  } = {},
): ProactiveSilentOutcomeReviewV1 | null {
  const value = event.value as ProactiveSilentLearningMemoryValueV1 | undefined;
  if (!value?.silentLearning) return null;
  return evaluateSilentLearningOutcomeHeuristic({
    silent: value.silentLearning,
    memoryEventId: event.memoryEventId,
    ...hints,
  });
}

export type ProactiveSilentOutcomeReviewStatsV1 = {
  total: number;
  shouldHaveNotified: number;
  correctlySilent: number;
  inconclusive: number;
  /** shouldHaveNotified / (should+correct) when both > 0 */
  falseNegativeRate: number | null;
  meanNearMissGap: number | null;
};

export function computeSilentOutcomeReviewStats(
  reviews: ProactiveSilentOutcomeReviewV1[],
): ProactiveSilentOutcomeReviewStatsV1 {
  let shouldHaveNotified = 0;
  let correctlySilent = 0;
  let inconclusive = 0;
  const gaps: number[] = [];

  for (const r of reviews) {
    if (r.verdict === 'SHOULD_HAVE_NOTIFIED') shouldHaveNotified += 1;
    else if (r.verdict === 'CORRECTLY_SILENT') correctlySilent += 1;
    else inconclusive += 1;
    if (r.signals.nearMissValueGap != null) {
      gaps.push(r.signals.nearMissValueGap);
    }
  }

  const decided = shouldHaveNotified + correctlySilent;
  return {
    total: reviews.length,
    shouldHaveNotified,
    correctlySilent,
    inconclusive,
    falseNegativeRate: decided > 0 ? shouldHaveNotified / decided : null,
    meanNearMissGap:
      gaps.length > 0
        ? gaps.reduce((a, b) => a + b, 0) / gaps.length
        : null,
  };
}
