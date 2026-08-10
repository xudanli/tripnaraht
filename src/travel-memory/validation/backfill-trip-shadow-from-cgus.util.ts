/**
 * CGUS Outcome Loop → Trip Shadow Pair 回填。
 *
 * action / outcome / diagnosis 任一阶段都可刷新；northStarReady 需分歧 + 可判质量。
 */

import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';
import type { MemoryDecisionTraceV1 } from '../runtime/memory-decision-trace.types';
import {
  buildTripShadowPair,
  evaluateTripShadowCases,
  summarizeTripShadowNorthStar,
  tripShadowPairToObservability,
  type TripShadowPairV1,
} from './build-trip-shadow-pair.util';
import type {
  ShadowMemoryCompareCaseV1,
  ShadowMemoryEvaluationBundleV1,
} from './memory-validation-loop.types';

const TRACE_LOG_CAP = 50;

export function mapCgusRegretToNumber(
  regret: CgusDecisionTraceV1['decision_regret'] | undefined,
): number | null {
  if (regret == null || regret === 'UNKNOWN') return null;
  if (regret === 'NONE') return 0;
  if (regret === 'LOW') return 0.2;
  if (regret === 'MEDIUM') return 0.5;
  if (regret === 'HIGH') return 0.75;
  return null;
}

export function deriveAcceptedFromCgusTrace(
  trace: CgusDecisionTraceV1,
  withMemoryRecommendation: string | null | undefined,
): boolean | null {
  if (trace.user_action === 'ACCEPT') return true;
  if (trace.user_action === 'OVERRIDE') {
    if (
      withMemoryRecommendation &&
      trace.chosen_candidate &&
      trace.chosen_candidate === withMemoryRecommendation
    ) {
      return true;
    }
    return false;
  }
  if (trace.user_action === 'REJECT_ALL') return false;
  return null;
}

export type TripShadowSeedV1 = {
  decisionId: string;
  tripId: string;
  withoutMemoryRecommendation: string;
  withMemoryRecommendation: string;
  memoryDecisionTrace?: MemoryDecisionTraceV1 | null;
};

/** 从 DSO hints 取出可回填的 Without/With 种子 */
export function extractTripShadowSeedFromHints(hints: {
  tripShadowPairRecord?: TripShadowPairV1 | null;
  tripShadowPair?: Record<string, unknown> | null;
  memoryDecisionTrace?: MemoryDecisionTraceV1 | null;
  cgusDecisionTrace?: CgusDecisionTraceV1 | null;
} | null | undefined): TripShadowSeedV1 | null {
  if (!hints) return null;
  const record = hints.tripShadowPairRecord;
  if (record?.decisionPair) {
    return {
      decisionId: record.decisionPair.decisionId,
      tripId: record.decisionPair.tripId,
      withoutMemoryRecommendation: record.decisionPair.baseline.recommendation,
      withMemoryRecommendation: record.decisionPair.memoryAssisted.recommendation,
      memoryDecisionTrace: hints.memoryDecisionTrace ?? null,
    };
  }
  const obs = hints.tripShadowPair;
  const without = typeof obs?.without === 'string' ? obs.without : null;
  const withMem = typeof obs?.withMemory === 'string' ? obs.withMemory : null;
  const decisionId =
    (typeof obs?.decisionId === 'string' && obs.decisionId) ||
    hints.cgusDecisionTrace?.decision_id ||
    null;
  const tripId =
    (typeof obs?.tripId === 'string' && obs.tripId) ||
    hints.cgusDecisionTrace?.trip_id ||
    null;
  if (!without || !withMem || !decisionId || !tripId) return null;
  return {
    decisionId,
    tripId,
    withoutMemoryRecommendation: without,
    withMemoryRecommendation: withMem,
    memoryDecisionTrace: hints.memoryDecisionTrace ?? null,
  };
}

/**
 * 用 CGUS Trace 回填 Trip Shadow Pair。
 * 无种子（从未产出 Pair）时返回 null。
 */
export function backfillTripShadowPairFromCgusTrace(input: {
  seed: TripShadowSeedV1;
  trace: CgusDecisionTraceV1;
}): TripShadowPairV1 | null {
  const withMem = input.seed.withMemoryRecommendation;
  const userChosen = input.trace.chosen_candidate ?? null;
  const accepted = deriveAcceptedFromCgusTrace(input.trace, withMem);
  const regret = mapCgusRegretToNumber(input.trace.decision_regret);

  return buildTripShadowPair({
    decisionId: input.seed.decisionId,
    tripId: input.seed.tripId,
    withoutMemoryRecommendation: input.seed.withoutMemoryRecommendation,
    withMemoryRecommendation: withMem,
    liveRecommendation: input.trace.recommended_candidate ?? withMem,
    memoryDecisionTrace: input.seed.memoryDecisionTrace,
    userChosen,
    accepted,
    regret,
  });
}

export function upsertTripShadowCaseLog(
  prev: ShadowMemoryCompareCaseV1[] | undefined,
  next: ShadowMemoryCompareCaseV1,
): ShadowMemoryCompareCaseV1[] {
  const list = prev ?? [];
  const idx = list.findIndex((c) => c.decisionId === next.decisionId);
  const merged =
    idx >= 0
      ? list.map((c, i) => (i === idx ? next : c))
      : [...list, next];
  return merged.slice(-TRACE_LOG_CAP);
}

export type TripShadowOutcomePatchV1 = {
  tripShadowPairRecord: TripShadowPairV1;
  tripShadowPair: Record<string, unknown>;
  tripShadowCaseLog: ShadowMemoryCompareCaseV1[];
  tripShadowEvaluation: ShadowMemoryEvaluationBundleV1;
  tripShadowNorthStar: ReturnType<typeof summarizeTripShadowNorthStar>;
};

/**
 * Outcome Loop → Shadow 回填补丁（供 DSO merge）。
 */
export function buildTripShadowOutcomePatch(input: {
  hints: {
    tripShadowPairRecord?: TripShadowPairV1 | null;
    tripShadowPair?: Record<string, unknown> | null;
    memoryDecisionTrace?: MemoryDecisionTraceV1 | null;
    cgusDecisionTrace?: CgusDecisionTraceV1 | null;
  } | null | undefined;
  trace: CgusDecisionTraceV1;
  prevCaseLog?: ShadowMemoryCompareCaseV1[];
  totalDecisions?: number;
}): TripShadowOutcomePatchV1 | null {
  const seed = extractTripShadowSeedFromHints(input.hints);
  if (!seed) return null;
  // decision_id 对齐：仅回填同一决策
  if (
    input.hints?.tripShadowPairRecord?.decisionPair.decisionId &&
    input.hints.tripShadowPairRecord.decisionPair.decisionId !==
      input.trace.decision_id
  ) {
    return null;
  }
  if (
    typeof input.hints?.tripShadowPair?.decisionId === 'string' &&
    input.hints.tripShadowPair.decisionId !== input.trace.decision_id
  ) {
    return null;
  }

  const pair = backfillTripShadowPairFromCgusTrace({
    seed: { ...seed, decisionId: input.trace.decision_id, tripId: input.trace.trip_id },
    trace: input.trace,
  });
  if (!pair) return null;

  const tripShadowCaseLog = upsertTripShadowCaseLog(
    input.prevCaseLog,
    pair.compareCase,
  );
  const tripShadowEvaluation = evaluateTripShadowCases({
    cases: tripShadowCaseLog,
    totalDecisions: input.totalDecisions ?? Math.max(tripShadowCaseLog.length, 1),
  });
  const tripShadowNorthStar = summarizeTripShadowNorthStar(tripShadowEvaluation);

  return {
    tripShadowPairRecord: pair,
    tripShadowPair: tripShadowPairToObservability(pair),
    tripShadowCaseLog,
    tripShadowEvaluation,
    tripShadowNorthStar,
  };
}
