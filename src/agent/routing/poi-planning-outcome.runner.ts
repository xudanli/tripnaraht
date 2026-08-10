/**
 * POI Planning Outcome 观测写入（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { DecisionState, PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  buildPoiPlanningOutcomePhaseReport,
  type PoiPlanningAdmissionDiagnosticsInput,
} from '../../planning-policy/utils/poi-planning-outcome-metrics.util';
import {
  countPoiPlanningFallbackInPois,
  extractPlanningSlugsFromItinerary,
  extractPlanningSlugsFromPois,
  type MinimalItineraryItem,
} from '../../planning-policy/utils/poi-planning-slug-resolve.util';

export function compactPoiPlanningSliceForOutcome(slice: PoiPlanningDecisionSlice | undefined):
  | {
      regionId?: string;
      feasibility?: 'ok' | 'tight' | 'failed';
      resolution?: PoiPlanningDecisionSlice['resolution'];
      appliedBackoffSteps?: string[];
      budgetGateApplied?: boolean;
    }
  | undefined {
  if (!slice) return undefined;
  return {
    regionId: slice.routeIntent?.regionId,
    feasibility: slice.schedulePlan?.feasibility,
    resolution: slice.resolution,
    appliedBackoffSteps: slice.appliedBackoffSteps,
    budgetGateApplied: slice.budgetGateApplied,
  };
}

export function recordPoiPlanningOutcomeAfterSelection(
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
  scoredPois: unknown[],
  admissionDiagnostics?: PoiPlanningAdmissionDiagnosticsInput,
): void {
  const slugs = extractPlanningSlugsFromPois(scoredPois);
  const fb = countPoiPlanningFallbackInPois(scoredPois);
  const report = buildPoiPlanningOutcomePhaseReport(decisionState?.poiPlanning, slugs, {
    phase: 'poi_selection',
    scoredPoisForRank: scoredPois,
    fallbackAnchorCount: fb,
    admissionDiagnostics,
  });
  const meta = state.metadata as Record<string, unknown>;
  const prev = (meta.poiPlanningOutcome ?? {}) as Record<string, unknown>;
  meta.poiPlanningOutcome = {
    ...prev,
    slice: compactPoiPlanningSliceForOutcome(decisionState?.poiPlanning),
    poiSelection: report,
  };
}

export function recordPoiPlanningOutcomeAfterItinerary(
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
): void {
  const slugs = extractPlanningSlugsFromItinerary(state.itinerary);
  const itineraryItems: MinimalItineraryItem[] =
    state.itinerary?.days?.flatMap((d) => (d.items ?? []) as MinimalItineraryItem[]) ?? [];
  const report = buildPoiPlanningOutcomePhaseReport(decisionState?.poiPlanning, slugs, {
    phase: 'itinerary_final',
    itineraryItemsForReasons: itineraryItems,
    fallbackAnchorCount: 0,
  });
  const meta = state.metadata as Record<string, unknown>;
  const prev = (meta.poiPlanningOutcome ?? {}) as Record<string, unknown>;
  meta.poiPlanningOutcome = {
    ...prev,
    slice: compactPoiPlanningSliceForOutcome(decisionState?.poiPlanning),
    itineraryFinal: report,
  };
  if (state.metadata?.show_poi_trace) {
    state.metadata.poi_trace = {
      ...(state.metadata.poi_trace || {}),
      poi_planning_outcome: meta.poiPlanningOutcome,
    };
  }
}
