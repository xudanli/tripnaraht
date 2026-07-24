import type { Logger } from '@nestjs/common';
import type { LlmService } from '../../../../llm/services/llm.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { PoiPlanningAdmissionDiagnosticsInput } from '../../../../planning-policy/utils/poi-planning-outcome-metrics.util';
import type {
  ItineraryAdjustSpatialConstraints,
  NeighborAnchorContext,
  TripDayAnchorRow,
} from '../../../utils/itinerary-adjust-neighbor-anchors.util';

export type PoiSelectionStepResult = {
  needsClarification: boolean;
  allowWithFallback: boolean;
};

export interface RunPoiSelectionPhaseParams {
  state: OrchestratorState;
  decisionState?: DecisionState;
}

/**
 * POI_SELECTION 阶段宿主：由 ClaudeOrchestratorService 实现。
 */
export interface PoiSelectionPhaseHost {
  readonly logger: Logger;
  /** 稀疏区 open-world LLM mention 抽取（OPEN_WORLD_DISCOVERY_LLM=1 时生效） */
  readonly llmService?: LlmService;

  resolvePoiPolicy(
    explicitPolicy: unknown,
    requirePoiData: boolean,
  ): 'strict' | 'fallback' | 'explore';

  inferCountryFromDestination(destinationRaw: string): string | undefined;

  normalizeText(s: string): string;

  dedupePois(pois: unknown[]): unknown[];

  loadTripPlacePoiEvidenceForAdjust(tripId: string, userId?: string): Promise<unknown[]>;

  resolveItineraryAdjustNeighborContext(
    tripId: string,
    targetDateIso: string,
    userId?: string,
  ): Promise<{
    anchors: NeighborAnchorContext;
    spatial: ItineraryAdjustSpatialConstraints;
    dayRows?: TripDayAnchorRow[];
  } | null>;

  /** 走廊内候选不足时 poi.search 沿邻日锚点中点补检 */
  supplementItineraryAdjustCorridorPois(params: {
    destinationRaw: string;
    anchors: NeighborAnchorContext;
    spatial: ItineraryAdjustSpatialConstraints;
  }): Promise<{ pois: unknown[]; query?: string; count: number }>;

  applyPoiPlanningToResearchPois(
    pois: unknown[],
    decisionState: DecisionState | undefined,
    destinationCountry?: string,
  ): { pois: unknown[]; excludedFilteredCount: number };

  passesHardPoiGuards(
    poi: unknown,
    destinationCountry?: string,
    destinationRaw?: string,
  ): boolean;

  poiLocalityScore(
    poi: unknown,
    destinationCountry?: string,
    destinationCity?: string,
  ): number;

  selectClusteredPois(
    rankedPois: unknown[],
    topN: number,
    startCoordinates: unknown,
    destinationRaw: string,
  ): unknown[];

  buildPoiPlanningAnchorFallbackStub(slug: string): unknown;

  tryExtractStartCoordinates(origin: unknown): { lat: number; lng: number } | undefined;

  toPoiTraceNode(poi: unknown): unknown;

  buildPoiTraceCommuteMatrix(
    nodes: unknown[],
    mode: unknown,
    startCoordinates: { lat: number; lng: number } | undefined,
  ): unknown;

  estimateNearestTotalCommuteMinutes(
    nodes: unknown[],
    mode: unknown,
    startCoordinates: { lat: number; lng: number } | undefined,
  ): number;

  countryDisplayName(country: string): string;

  buildPoiCountryClarificationQuestion(destinationRaw: string, destinationCountry: string): unknown;

  recordPoiPlanningOutcomeAfterSelection(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    scoredPois: unknown[],
    admissionDiagnostics?: PoiPlanningAdmissionDiagnosticsInput,
  ): void;

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: import('../../../interfaces/trip-plan.interface').OrchestrationStep,
    actor: string,
  ): Promise<void>;
}
