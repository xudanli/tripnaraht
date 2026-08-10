/**
 * CGUS Outcome Loop — 从 DSO 解析 Trace、回写并投影 Trip Review 摘要。
 * 不修改 EU 公式。
 */

import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type {
  CgusActualOutcomeV1,
  CgusDecisionRegret,
  CgusDecisionRootCause,
  CgusDecisionTraceV1,
  CgusDecisionUserAction,
  CgusRecommendationProblematic,
} from './cgus-decision-trace.types';
import {
  applyCgusOutcomeWriteback,
  applyCgusTripReviewDiagnosis,
  applyCgusUserActionWriteback,
  CgusOutcomeLoopError,
  isCgusWrongRecommendation,
} from './cgus-decision-outcome-loop.util';
import { buildTripShadowOutcomePatch } from '../../../travel-memory/validation/backfill-trip-shadow-from-cgus.util';
import type { ShadowMemoryCompareCaseV1 } from '../../../travel-memory/validation/memory-validation-loop.types';
import type { ShadowMemoryEvaluationBundleV1 } from '../../../travel-memory/validation/memory-validation-loop.types';

const TRACE_LOG_CAP = 50;

export type CgusOutcomeLoopWriteKind = 'action' | 'outcome' | 'diagnosis';

export type CgusOutcomeLoopWritePayload =
  | {
      kind: 'action';
      user_action: CgusDecisionUserAction;
      chosen_candidate?: string;
      override_reason?: string;
    }
  | {
      kind: 'outcome';
      actual_outcome: CgusActualOutcomeV1;
      decision_regret: CgusDecisionRegret;
    }
  | {
      kind: 'diagnosis';
      recommendation_problematic: CgusRecommendationProblematic;
      root_cause?: CgusDecisionRootCause;
      review_note?: string;
      reviewed_by: string;
    };

/** Trip Review 页顶栏所需最小摘要（非算法参数） */
export interface CgusTripReviewSummaryV1 {
  decision_id: string;
  trip_id: string;
  decision_type: string;
  recommended_candidate?: string;
  user_action?: CgusDecisionUserAction;
  chosen_candidate?: string;
  actual_outcome?: CgusActualOutcomeV1;
  decision_regret?: CgusDecisionRegret;
  recommendation_problematic?: CgusRecommendationProblematic;
  root_cause?: CgusDecisionRootCause;
  review_note?: string;
  /** 对比表用：Top 候选分项 */
  score_compare: Array<{
    candidate_id: string;
    scores: CgusDecisionTraceV1['candidate_scores'][string];
    is_recommended: boolean;
    is_chosen: boolean;
  }>;
  is_wrong_recommendation: boolean;
}

export function listCgusDecisionTraces(dso: DecisionState): CgusDecisionTraceV1[] {
  const log = dso.systemState?.cgusDecisionTraceLog ?? [];
  const current = dso.optimizationHints?.cgusDecisionTrace;
  if (!current) return [...log];
  if (log.some((t) => t.decision_id === current.decision_id)) {
    return log.map((t) => (t.decision_id === current.decision_id ? current : t));
  }
  return [...log, current];
}

export function findCgusDecisionTrace(
  dso: DecisionState,
  decisionId?: string,
): CgusDecisionTraceV1 | undefined {
  const traces = listCgusDecisionTraces(dso);
  if (decisionId) {
    return traces.find((t) => t.decision_id === decisionId);
  }
  return dso.optimizationHints?.cgusDecisionTrace ?? traces[traces.length - 1];
}

export function upsertCgusDecisionTraceLog(
  log: CgusDecisionTraceV1[] | undefined,
  next: CgusDecisionTraceV1,
): CgusDecisionTraceV1[] {
  const prev = log ?? [];
  const idx = prev.findIndex((t) => t.decision_id === next.decision_id);
  const merged =
    idx >= 0
      ? [...prev.slice(0, idx), next, ...prev.slice(idx + 1)]
      : [...prev, next];
  return merged.slice(-TRACE_LOG_CAP);
}

export function applyCgusOutcomeLoopToTrace(
  trace: CgusDecisionTraceV1,
  payload: CgusOutcomeLoopWritePayload,
): CgusDecisionTraceV1 {
  if (payload.kind === 'action') {
    return applyCgusUserActionWriteback(trace, {
      user_action: payload.user_action,
      chosen_candidate: payload.chosen_candidate,
      override_reason: payload.override_reason,
    });
  }
  if (payload.kind === 'outcome') {
    return applyCgusOutcomeWriteback(trace, {
      actual_outcome: payload.actual_outcome,
      decision_regret: payload.decision_regret,
    });
  }
  return applyCgusTripReviewDiagnosis(trace, {
    recommendation_problematic: payload.recommendation_problematic,
    root_cause: payload.root_cause,
    review_note: payload.review_note,
    reviewed_by: payload.reviewed_by,
  });
}

/**
 * 在 DSO 上应用一次 Outcome Loop 回写，返回新 patch 所需字段（不可变）。
 * 若存在 Trip Shadow Pair 种子，同步回填 Without/With 质量判定。
 */
export function buildCgusOutcomeLoopDsoPatch(
  dso: DecisionState,
  payload: CgusOutcomeLoopWritePayload,
  decisionId?: string,
): {
  nextTrace: CgusDecisionTraceV1;
  optimizationHints: DecisionState['optimizationHints'];
  cgusDecisionTraceLog: CgusDecisionTraceV1[];
  tripShadowCaseLog?: ShadowMemoryCompareCaseV1[];
  tripShadowEvaluation?: ShadowMemoryEvaluationBundleV1;
  tripShadowNorthStar?: {
    question: string;
    answerable: boolean;
    preventedMistakeCount: number;
    harmCount: number;
    promotionBlocked: boolean;
    summaryZh: string;
  };
} {
  const base = findCgusDecisionTrace(dso, decisionId);
  if (!base) {
    throw new CgusOutcomeLoopError(
      decisionId
        ? `No CGUS decision trace for decision_id=${decisionId}`
        : 'No CGUS decision trace on DSO (run OPTIMIZE first)',
    );
  }
  const nextTrace = applyCgusOutcomeLoopToTrace(base, payload);
  const cgusDecisionTraceLog = upsertCgusDecisionTraceLog(
    dso.systemState?.cgusDecisionTraceLog,
    nextTrace,
  );

  const currentHints = dso.optimizationHints;
  const shouldMirrorHints =
    !currentHints?.cgusDecisionTrace ||
    currentHints.cgusDecisionTrace.decision_id === nextTrace.decision_id;

  let optimizationHints = shouldMirrorHints
    ? {
        ...(currentHints ?? {}),
        cgusDecisionTrace: nextTrace,
      }
    : currentHints;

  let tripShadowCaseLog = dso.systemState?.tripShadowCaseLog;
  let tripShadowEvaluation = dso.systemState?.tripShadowEvaluation;
  let tripShadowNorthStar:
    | {
        question: string;
        answerable: boolean;
        preventedMistakeCount: number;
        harmCount: number;
        promotionBlocked: boolean;
        summaryZh: string;
      }
    | undefined;

  if (shouldMirrorHints) {
    try {
      const shadowPatch = buildTripShadowOutcomePatch({
        hints: optimizationHints,
        trace: nextTrace,
        prevCaseLog: dso.systemState?.tripShadowCaseLog,
        totalDecisions: Math.max(
          (dso.systemState?.cgusDecisionTraceLog?.length ?? 0) + 1,
          1,
        ),
      });
      if (shadowPatch) {
        optimizationHints = {
          ...(optimizationHints ?? {}),
          tripShadowPair: shadowPatch.tripShadowPair,
          tripShadowPairRecord: shadowPatch.tripShadowPairRecord,
        };
        tripShadowCaseLog = shadowPatch.tripShadowCaseLog;
        tripShadowEvaluation = shadowPatch.tripShadowEvaluation;
        tripShadowNorthStar = shadowPatch.tripShadowNorthStar;
      }
    } catch {
      // Shadow 回填失败不阻断 Outcome Loop
    }
  }

  return {
    nextTrace,
    optimizationHints,
    cgusDecisionTraceLog,
    tripShadowCaseLog,
    tripShadowEvaluation,
    tripShadowNorthStar,
  };
}

export function projectCgusTripReviewSummary(trace: CgusDecisionTraceV1): CgusTripReviewSummaryV1 {
  const topIds = trace.ranking.slice(0, 5);
  const ids =
    topIds.length > 0
      ? topIds
      : Object.keys(trace.candidate_scores).slice(0, 5);

  return {
    decision_id: trace.decision_id,
    trip_id: trace.trip_id,
    decision_type: trace.decision_type,
    recommended_candidate: trace.recommended_candidate,
    user_action: trace.user_action,
    chosen_candidate: trace.chosen_candidate,
    actual_outcome: trace.actual_outcome,
    decision_regret: trace.decision_regret,
    recommendation_problematic: trace.recommendation_problematic,
    root_cause: trace.root_cause,
    review_note: trace.review_note,
    score_compare: ids.map((id) => ({
      candidate_id: id,
      scores: trace.candidate_scores[id] ?? {},
      is_recommended: id === trace.recommended_candidate,
      is_chosen: id === trace.chosen_candidate,
    })),
    is_wrong_recommendation: isCgusWrongRecommendation(trace),
  };
}
