import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import {
  computeTopAnchorRanksInSelection,
  computeUnresolvedAnchorReasonsForPoiRows,
  computeUnresolvedAnchorReasonsForItineraryItems,
  type MinimalItineraryItem,
  type UnresolvedAnchorReason,
} from './poi-planning-slug-resolve.util';
import {
  computeAnchorOutcomeSources,
  type AnchorOutcomeSourceRow,
} from './anchor-outcome-sources.util';

/** Phase 1.6：从 slice + 最终选中 slug 计算结果型指标（纯函数，无 IO） */
export interface PoiPlanningOutcomeMetrics {
  /** 无 poiPlanning 时全程为 true，其它指标可忽略 */
  noPoiPlanning: boolean;
  anchorCoverage: {
    required: string[];
    present: string[];
    missing: string[];
    rate: number;
  };
  /** 选中 optional 个数是否超过建议上限（仅当 slice 仍含 optional 池时有意义） */
  optionalOverflow: {
    selectedOptionalCount: number;
    suggestedMaxOptional: number;
    overflow: boolean;
  };
  /** exclude 是否出现在最终选中集合 */
  excludedLeakage: {
    excluded: string[];
    leaked: string[];
  };
  /** feasibility / gate 与 optional 池是否一致 */
  budgetGateCorrect: boolean;
}

const DEFAULT_MAX_OPTIONAL_WHEN_OK = 2;

export function computePoiPlanningOutcomeMetrics(
  slice: PoiPlanningDecisionSlice | undefined,
  finalSelectedSlugs: string[],
  options?: { maxOptionalWhenFeasibilityOk?: number },
): PoiPlanningOutcomeMetrics {
  const set = new Set(finalSelectedSlugs.map((s) => s.trim().toLowerCase()));
  if (!slice?.poiPlan) {
    return {
      noPoiPlanning: true,
      anchorCoverage: {
        required: [],
        present: [],
        missing: [],
        rate: 1,
      },
      optionalOverflow: {
        selectedOptionalCount: 0,
        suggestedMaxOptional: DEFAULT_MAX_OPTIONAL_WHEN_OK,
        overflow: false,
      },
      excludedLeakage: { excluded: [], leaked: [] },
      budgetGateCorrect: true,
    };
  }

  const required = slice.poiPlan.requiredAnchorPoiIds ?? [];
  const optionalPool = slice.poiPlan.optionalCandidatePoiIds ?? [];
  const excluded = slice.poiPlan.excludedPoiIds ?? [];

  const present = required.filter((id) => set.has(id.trim().toLowerCase()));
  const missing = required.filter((id) => !set.has(id.trim().toLowerCase()));
  const rate = required.length === 0 ? 1 : present.length / required.length;

  const optionalPoolSet = new Set(optionalPool.map((s) => s.trim().toLowerCase()));
  const selectedOptionalCount = finalSelectedSlugs.filter((id) =>
    optionalPoolSet.has(id.trim().toLowerCase()),
  ).length;

  const feas = slice.schedulePlan?.feasibility;
  const gateApplied = slice.budgetGateApplied === true;
  const maxOpt =
    options?.maxOptionalWhenFeasibilityOk ?? DEFAULT_MAX_OPTIONAL_WHEN_OK;
  const suggestedMax =
    feas === 'ok' && !gateApplied && optionalPool.length > 0
      ? maxOpt
      : 0;

  const overflow =
    feas === 'ok' && !gateApplied && selectedOptionalCount > suggestedMax;

  const leaked = excluded.filter((id) => set.has(id.trim().toLowerCase()));

  const budgetGateCorrect =
    feas === 'failed' || feas === 'tight' || gateApplied
      ? optionalPool.length === 0
      : true;

  return {
    noPoiPlanning: false,
    anchorCoverage: {
      required,
      present,
      missing,
      rate,
    },
    optionalOverflow: {
      selectedOptionalCount,
      suggestedMaxOptional: suggestedMax,
      overflow,
    },
    excludedLeakage: {
      excluded,
      leaked,
    },
    budgetGateCorrect,
  };
}

/** Phase 2.0：单次阶段（TopN 或最终 itinerary）的 outcome 快照，供 API / replay 对齐 */
export interface PoiPlanningOutcomePhaseReport {
  phase: 'poi_selection' | 'itinerary_final';
  resolvedSlugs: string[];
  metrics: PoiPlanningOutcomeMetrics;
  /** POI_SELECTION 行里 `source === poi_planning_fallback` 的数量 */
  fallbackAnchorCount: number;
  /** 相对必选锚点数的占位比例（无必选锚点时：有 fallback 则为 1，否则 0） */
  fallbackRate: number;
  /** 仅 poi_selection：必选锚点在最终 TopN 中的名次 */
  topAnchorRanks?: Record<string, number | null>;
  /** Phase 2.3：缺失锚点原因（排障；仅在有必选锚点且未全覆盖时有值） */
  unresolvedAnchorReasons?: Partial<Record<string, UnresolvedAnchorReason>>;
  /** Phase 2.5：merge 后锚点来源（matched_in_research | fallback_placeholder | …） */
  requiredAnchorCandidatePresence?: Record<string, string>;
  /** Phase 2.5：锚点最终落在哪一阶段（in_topn | dropped_before_topn | …） */
  requiredAnchorAdmissionStage?: Record<string, string>;
  /** Phase 3：各必选锚点来源（retrieved | matched_existing | fallback） */
  anchorSources?: AnchorOutcomeSourceRow[];
  /** Phase 3：明确标记为检索命中的锚点个数 */
  retrievedAnchorCount?: number;
  /** Phase 3：retrievedAnchorCount / required 数 */
  retrievedAnchorRate?: number;
}

export type PoiPlanningAdmissionDiagnosticsInput = {
  requiredAnchorCandidatePresence?: Record<string, string>;
  requiredAnchorAdmissionStage?: Record<string, string>;
};

export function buildPoiPlanningOutcomePhaseReport(
  slice: PoiPlanningDecisionSlice | undefined,
  resolvedSlugs: string[],
  input: {
    phase: 'poi_selection' | 'itinerary_final';
    scoredPoisForRank?: unknown[];
    /** itinerary_final 时传入全部行程项，用于 unresolved 解释 */
    itineraryItemsForReasons?: MinimalItineraryItem[];
    fallbackAnchorCount?: number;
    /** Phase 2.5：检索侧准入诊断（仅 poi_selection） */
    admissionDiagnostics?: PoiPlanningAdmissionDiagnosticsInput;
  },
): PoiPlanningOutcomePhaseReport {
  const metrics = computePoiPlanningOutcomeMetrics(slice, resolvedSlugs);
  const required = slice?.poiPlan?.requiredAnchorPoiIds ?? [];
  const fb = input.fallbackAnchorCount ?? 0;
  let fallbackRate: number;
  if (required.length > 0) {
    fallbackRate = Math.min(1, fb / required.length);
  } else {
    fallbackRate = fb > 0 ? 1 : 0;
  }

  let topAnchorRanks: Record<string, number | null> | undefined;
  if (
    input.phase === 'poi_selection' &&
    input.scoredPoisForRank?.length &&
    required.length > 0
  ) {
    topAnchorRanks = computeTopAnchorRanksInSelection(required, input.scoredPoisForRank);
  }

  let unresolvedAnchorReasons: Partial<Record<string, UnresolvedAnchorReason>> | undefined;
  if (required.length > 0 && metrics.anchorCoverage.rate < 1) {
    if (input.phase === 'poi_selection') {
      if (input.scoredPoisForRank?.length) {
        unresolvedAnchorReasons = computeUnresolvedAnchorReasonsForPoiRows(
          required,
          resolvedSlugs,
          input.scoredPoisForRank,
        );
      } else {
        const missing = metrics.anchorCoverage.missing;
        unresolvedAnchorReasons = Object.fromEntries(
          missing.map((m) => [m, 'not_in_topn' as const]),
        );
      }
    } else if (
      input.phase === 'itinerary_final' &&
      input.itineraryItemsForReasons?.length
    ) {
      unresolvedAnchorReasons = computeUnresolvedAnchorReasonsForItineraryItems(
        required,
        resolvedSlugs,
        input.itineraryItemsForReasons,
      );
    } else if (input.phase === 'itinerary_final') {
      const missing = metrics.anchorCoverage.missing;
      unresolvedAnchorReasons = Object.fromEntries(
        missing.map((m) => [m, 'not_in_topn' as const]),
      );
    }
  }

  const adm = input.admissionDiagnostics;

  let anchorSources: AnchorOutcomeSourceRow[] | undefined;
  let retrievedAnchorCount: number | undefined;
  let retrievedAnchorRate: number | undefined;
  if (
    input.phase === 'poi_selection' &&
    required.length > 0 &&
    input.scoredPoisForRank?.length
  ) {
    anchorSources = computeAnchorOutcomeSources(required, input.scoredPoisForRank);
    retrievedAnchorCount = anchorSources.filter((r) => r.source === 'retrieved').length;
    retrievedAnchorRate = required.length > 0 ? retrievedAnchorCount / required.length : 0;
  }

  return {
    phase: input.phase,
    resolvedSlugs,
    metrics,
    fallbackAnchorCount: fb,
    fallbackRate,
    topAnchorRanks,
    unresolvedAnchorReasons,
    ...(adm?.requiredAnchorCandidatePresence
      ? { requiredAnchorCandidatePresence: adm.requiredAnchorCandidatePresence }
      : {}),
    ...(adm?.requiredAnchorAdmissionStage
      ? { requiredAnchorAdmissionStage: adm.requiredAnchorAdmissionStage }
      : {}),
    ...(anchorSources ? { anchorSources, retrievedAnchorCount, retrievedAnchorRate } : {}),
  };
}
