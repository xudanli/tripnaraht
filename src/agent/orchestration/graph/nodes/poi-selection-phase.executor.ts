import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../../../planning-policy/regions/iceland-poi-slugs';
import { POI_PLANNING_SCORE_REASON } from '../../../../planning-policy/constants/poi-planning-score-reasons';
import type { PoiPlanningAdmissionDiagnosticsInput } from '../../../../planning-policy/utils/poi-planning-outcome-metrics.util';
import {
  buildPoiPlanningAdmissionDiagnostics,
  enforceRequiredAnchorsTopN,
} from '../../../../planning-policy/utils/poi-planning-anchor-admission.util';
import {
  annotateRetrievalTraceAfterPoiSelection,
} from '../../../../planning-policy/utils/build-retrieval-decision-trace.util';
import { buildGapBehaviorObservation } from '../../../../planning-policy/utils/build-gap-behavior-observation.util';
import type { RetrievalDecisionTrace } from '../../../../planning-policy/types/retrieval-decision-trace.types';
import {
  extractDecisionLogTripContext,
  formatPoiSelectionInputsZh,
  formatPoiSelectionOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import {
  buildDestinationScopeClarificationOptions,
  extractItineraryAdjustTargetDateFromMessage,
  isItineraryFullTripReplanMetadata,
  shouldSkipPoiDestinationClarificationForItineraryAdjust,
} from '../../../utils/itinerary-adjust-intent.util';
import {
  corridorScoreBoostForPoi,
  selectClusteredPoisAlongCorridor,
} from '../../../utils/itinerary-adjust-corridor-poi.util';
import type {
  ItineraryAdjustSpatialConstraints,
  NeighborAnchorContext,
  TripDayAnchorRow,
} from '../../../utils/itinerary-adjust-neighbor-anchors.util';
import { applyCorridorResearchMarkers } from '../../../utils/itinerary-trip-neighbor-anchor-load.util';
import { captureItineraryAdjustBaselineSchedule } from '../../../utils/itinerary-adjust-decision-log.util';
import {
  collectOccupiedPoiKeysFromItineraryDays,
  collectOccupiedPoiKeysFromTripDayRows,
  filterCandidatesExcludingOccupiedPois,
  mergeOccupiedPoiKeySets,
} from '../../../utils/itinerary-adjust-cross-day-dedupe.util';
import {
  ITINERARY_ADJUST_CORRIDOR_MIN_CANDIDATES_DEFAULT,
  resolveItineraryAdjustCorridorCandidatePool,
} from '../../../utils/itinerary-adjust-corridor-fallback.util';
import {
  buildItineraryAdjustAuditMetadata,
  extractPoiNamesFromScoredRows,
  formatPoiSelectionOutputsAdjustZh,
} from '../../../utils/itinerary-adjust-decision-log.util';
import { extractSelectedPlaceIdsFromItinerary, buildPoiSearchContext } from '../../../../planning-policy/utils/build-poi-search-context.util';
import {
  applyOffBeatBoostToScoreRows,
  enforceOffBeatQuotaInTopN,
} from '../../../../planning-policy/utils/poi-selection-offbeat.util';
import {
  applyDiversityPenaltyToSortedRows,
  applySelectedPoiPenalty,
  sortPoiScoreRowsDesc,
} from '../../../../planning-policy/utils/poi-selection-diversity.util';
import type { RouteAndRunIntentAnalysis } from '../../../utils/route-and-run-intent-analyzer.util';
import { detectRhythmOrDiningPlanningIntent } from '../../../context-engine/utils/sparse-poi-day-allocation.util';
import { applySparseRegionPoiGate, attachSparseRegionMetadata } from '../../../../planning-policy/open-world/sparse-poi-gate.util';
import { resolveSparseRegionProfile } from '../../../../planning-policy/profiles/sparse-region.profile';
import {
  mergeDiscoveryStubsIntoPoiEvidence,
} from '../../../../planning-policy/open-world/discovery-buffer.util';
import { runOpenWorldDiscoveryPipeline } from '../../../utils/open-world-discovery-pipeline.util';
import { syncDecisionContextToDecisionState } from '../../../../planning-policy/open-world/decision-context-sync.util';
import {
  sanitizeOrchestratorStateAfterPoiSelection,
  sanitizeOrchestratorStateBeforePoiSelection,
} from './poi-selection-projection.util';
import type {
  PoiSelectionPhaseHost,
  PoiSelectionStepResult,
  RunPoiSelectionPhaseParams,
} from './poi-selection-phase.host';
import { persistSelectedPoisToResearchData } from '../../../utils/harness-research-evidence-snapshot.util';
import { runPoiCandidatePipeline } from './poi-candidate-pipeline.util';

/**
 * POI_SELECTION 执行体：仅消费 research_data + DSO 空间约束；工作区键在漏斗口熔断。
 */
export async function runPoiSelectionPhase(
  host: PoiSelectionPhaseHost,
  params: RunPoiSelectionPhaseParams,
): Promise<PoiSelectionStepResult> {
  const { state, decisionState } = params;
  sanitizeOrchestratorStateBeforePoiSelection(state);
  try {
    return await runPoiSelectionPhaseCore(host, params);
  } finally {
    sanitizeOrchestratorStateAfterPoiSelection(state);
  }
}

async function runPoiSelectionPhaseCore(
  host: PoiSelectionPhaseHost,
  params: RunPoiSelectionPhaseParams,
): Promise<PoiSelectionStepResult> {
  const { state, decisionState } = params;

    const stepStartTime = Date.now();
    state.current_step = 'POI_SELECTION';

    const rawPoiEvidence = state.research_data?.poi_evidence;
    const asArray = Array.isArray(rawPoiEvidence)
      ? rawPoiEvidence
      : Array.isArray((rawPoiEvidence as any)?.pois)
        ? (rawPoiEvidence as any).pois
        : [];

    const destinationRaw =
      typeof state.trip_plan_request?.destination === 'string'
        ? state.trip_plan_request.destination
        : '';
    const poiPolicy = host.resolvePoiPolicy(
      state.metadata?.poi_policy,
      state.metadata?.require_poi_data === true,
    );
    const requirePoiData = poiPolicy === 'strict';
    const destinationCountry = host.inferCountryFromDestination(destinationRaw);
    const destinationCity = host.normalizeText(destinationRaw);

    const routeIntent = (state.metadata as Record<string, unknown>)
      ?.route_and_run_intent as RouteAndRunIntentAnalysis | undefined;
    const metaRecord = state.metadata as Record<string, unknown>;
    const isFullTripReplan = isItineraryFullTripReplanMetadata(metaRecord);
    const isItineraryAdjust = routeIntent?.primary === 'ITINERARY_ADJUST' && !isFullTripReplan;
    const tripId =
      state.trip_plan_request?.trip_id?.trim() ??
      state.trip_plan_request?.ontology_context?.trip_id?.trim() ??
      (state.metadata as { tripId?: string })?.tripId?.trim();
    const userId = (state.metadata as { userId?: string })?.userId;
    let adjustTargetDateIso: string | undefined;
    let adjustNeighborAnchors: NeighborAnchorContext | undefined;
    let adjustSpatial: ItineraryAdjustSpatialConstraints | undefined;
    let adjustTripDayRows: TripDayAnchorRow[] | undefined;
    if (isItineraryAdjust && tripId) {
      const intakeMsg =
        (state.metadata as { intake_user_message?: string })?.intake_user_message ??
        state.trip_plan_request?.message;
      adjustTargetDateIso = extractItineraryAdjustTargetDateFromMessage(
        typeof intakeMsg === 'string' ? intakeMsg : '',
        state.trip_plan_request?.date_range,
      );
      if (adjustTargetDateIso) {
        const neighborCtx = await host.resolveItineraryAdjustNeighborContext(
          tripId,
          adjustTargetDateIso,
          userId,
        );
        if (neighborCtx) {
          adjustNeighborAnchors = neighborCtx.anchors;
          adjustSpatial = neighborCtx.spatial;
          adjustTripDayRows = neighborCtx.dayRows;
          const meta = state.metadata as Record<string, unknown>;
          meta.itinerary_adjust_neighbor_anchors = neighborCtx.anchors;
          meta.itinerary_adjust_spatial = neighborCtx.spatial;
          meta.itinerary_adjust_target_date_iso = adjustTargetDateIso;
          captureItineraryAdjustBaselineSchedule(meta, adjustTargetDateIso, {
            tripDayRows: neighborCtx.dayRows,
            itinerary: state.itinerary,
          });
        }
      }
    }
    let candidatePool: any[] = [...asArray];
    let boundTripPoiSeedCount = 0;
    if (tripId) {
      const tripPois = await host.loadTripPlacePoiEvidenceForAdjust(tripId, userId);
      boundTripPoiSeedCount = tripPois.length;
      if (tripPois.length) {
        candidatePool = [...tripPois, ...candidatePool];
        (state.metadata as Record<string, unknown>).bound_trip_poi_seed_count = tripPois.length;
        if (routeIntent?.primary === 'ITINERARY_ADJUST') {
          (state.metadata as Record<string, unknown>).itinerary_adjust_trip_poi_seed_count =
            tripPois.length;
        }
      }
    }
    const rejectedIds = (decisionState?.userIntent?.excludePoiIds ?? [])
      .map((x) => String(x).trim().toLowerCase())
      .filter(Boolean);
    const pipeline = runPoiCandidatePipeline(candidatePool as any[], { rejectedIds });
    (state.metadata as Record<string, unknown>).poi_candidate_pipeline_v1 = {
      schemaId: pipeline.schemaId,
      version: pipeline.version,
      stage_audit: pipeline.stage_audit,
      er_catalog_hits: pipeline.er_catalog_hits,
    };
    let deduped = pipeline.pois as any[];
    const planningAug = host.applyPoiPlanningToResearchPois(
      deduped,
      decisionState,
      destinationCountry,
    );
    let withPlanning = planningAug.pois;
    if (isItineraryAdjust && adjustTargetDateIso) {
      const occupied = mergeOccupiedPoiKeySets(
        adjustTripDayRows
          ? collectOccupiedPoiKeysFromTripDayRows(adjustTripDayRows, adjustTargetDateIso)
          : { placeIds: new Set(), names: new Set() },
        collectOccupiedPoiKeysFromItineraryDays(state.itinerary, adjustTargetDateIso),
      );
      const { kept, excludedCount } = filterCandidatesExcludingOccupiedPois(withPlanning, occupied);
      if (excludedCount > 0) {
        withPlanning = kept;
        (state.metadata as Record<string, unknown>).itinerary_adjust_cross_day_excluded_count =
          excludedCount;
      }
    }
    if (planningAug.excludedFilteredCount > 0) {
      (state.metadata as Record<string, unknown>).poiPlanningExcludedFilteredCount =
        planningAug.excludedFilteredCount;
    }
    const sliceMeta = decisionState?.poiPlanning;
    if (sliceMeta?.budgetGateApplied) {
      (state.metadata as Record<string, unknown>).poiPlanningBudgetGateApplied = true;
      (state.metadata as Record<string, unknown>).poiPlanningFeasibility =
        sliceMeta.schedulePlan?.feasibility;
      (state.metadata as Record<string, unknown>).poiPlanningEnrichmentDisabled = true;
    }
    const poiPlanSlice = decisionState?.poiPlanning;
    let scoredRows = withPlanning
      .filter((poi: any) =>
        host.passesHardPoiGuards(poi, destinationCountry, destinationRaw),
      )
      .map((poi: any, idx: number) => {
        const riskLevel = poi?.metadata?.risk_level;
        const riskPenalty =
          riskLevel === 'HIGH' ? 2 : riskLevel === 'MEDIUM' ? 1 : 0;
        const hasOpeningHours = !!poi?.opening_hours;
        const openingHoursBonus = hasOpeningHours ? 1 : 0;
        const localityScore = host.poiLocalityScore(
          poi,
          destinationCountry,
          destinationCity,
        );
        const dataCompletenessBonus =
          poi?.address && poi?.name ? 0.5 : 0;
        let optionalBoost = 0;
        if (
          !poiPlanSlice?.budgetGateApplied &&
          poiPlanSlice?.poiPlan?.optionalCandidatePoiIds?.length &&
          destinationCountry === 'IS'
        ) {
          const hay = `${poi?.name ?? ''} ${poi?.nameCN ?? poi?.name ?? ''}`;
          for (const slug of poiPlanSlice.poiPlan.optionalCandidatePoiIds) {
            const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
            if (!kws?.length) continue;
            if (
              kws.some(
                (k) =>
                  hay.includes(k) ||
                  hay.toLowerCase().includes(k.toLowerCase()),
              )
            ) {
              optionalBoost = 2;
              poi.poi_planning_score_reasons = [
                ...(poi.poi_planning_score_reasons ?? []),
                POI_PLANNING_SCORE_REASON.OPTIONAL_BOOST,
              ];
              break;
            }
          }
        }
        const anchorBoost = poi?.poi_planning_anchor_slug ? 3 : 0;
        const corridorBoost = adjustSpatial ? corridorScoreBoostForPoi(poi, adjustSpatial) : 0;
        return {
          poi,
          idx,
          localityScore,
          openingHoursBonus,
          dataCompletenessBonus,
          riskPenalty,
          score:
            localityScore +
            openingHoursBonus +
            dataCompletenessBonus +
            optionalBoost +
            anchorBoost +
            corridorBoost -
            riskPenalty -
            idx * 0.01,
        };
      });
    scoredRows = applySelectedPoiPenalty(
      scoredRows,
      extractSelectedPlaceIdsFromItinerary(state.itinerary),
    );
    scoredRows = sortPoiScoreRowsDesc(scoredRows);
    scoredRows = applyDiversityPenaltyToSortedRows(scoredRows);
    const planningTextForDiversity = [
      (state.metadata as { intake_user_message?: string })?.intake_user_message,
      state.trip_plan_request?.message,
    ]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .join('\n');
    const poiSearchCtx = buildPoiSearchContext({
      destination: destinationRaw,
      decisionState,
      itinerary: state.itinerary,
      userMessage: planningTextForDiversity,
      travelPreference: (state.metadata as Record<string, unknown> | undefined)
        ?.travel_preference_snapshot as Record<string, unknown> | undefined,
    });
    const preferOffbeat = poiSearchCtx.preferOffbeatAttractions === true;
    scoredRows = applyOffBeatBoostToScoreRows(scoredRows, preferOffbeat);
    scoredRows = sortPoiScoreRowsDesc(scoredRows);
    const startCoordinates = host.tryExtractStartCoordinates(
      state.trip_plan_request?.origin,
    );
    const rankedPois = scoredRows.map((x) => x.poi);
    const requiredAnchors = poiPlanSlice?.poiPlan?.requiredAnchorPoiIds ?? [];
    const topNLimit = 8;
    const sparseProfileEarly = resolveSparseRegionProfile({
      countryCode: destinationCountry,
      destinationHint: destinationRaw,
    });
    const skipGeoClusterForDiversity =
      sparseProfileEarly?.defaultDayAllocation === 'intentional_slack' ||
      (detectRhythmOrDiningPlanningIntent(planningTextForDiversity) &&
        rankedPois.length >= 3);
    let adjustSpatialEffective = adjustSpatial;
    let rankedForCorridor = rankedPois;
    if (adjustSpatial) {
      const minCorridorCandidates = ITINERARY_ADJUST_CORRIDOR_MIN_CANDIDATES_DEFAULT;
      let corridorPool = resolveItineraryAdjustCorridorCandidatePool(
        rankedPois,
        adjustSpatial,
        minCorridorCandidates,
      );
      if (
        corridorPool.candidates.length < minCorridorCandidates &&
        adjustNeighborAnchors
      ) {
        const supplement = await host.supplementItineraryAdjustCorridorPois({
          destinationRaw,
          anchors: adjustNeighborAnchors,
          spatial: corridorPool.spatial,
        });
        if (supplement.count > 0) {
          const mergedRanked = host.dedupePois([
            ...corridorPool.candidates,
            ...supplement.pois,
            ...rankedPois,
          ]);
          corridorPool = resolveItineraryAdjustCorridorCandidatePool(
            mergedRanked,
            adjustSpatial,
            minCorridorCandidates,
          );
          corridorPool = {
            ...corridorPool,
            diagnostics: {
              ...corridorPool.diagnostics,
              poiSearchSupplementCount: supplement.count,
            },
          };
          const metaSup = state.metadata as Record<string, unknown>;
          metaSup.itinerary_adjust_corridor_poi_search = {
            query: supplement.query,
            count: supplement.count,
          };
        }
      }
      rankedForCorridor = corridorPool.candidates;
      adjustSpatialEffective = corridorPool.spatial;
      const metaCorridor = state.metadata as Record<string, unknown>;
      metaCorridor.itinerary_adjust_corridor_fallback = corridorPool.diagnostics;
      metaCorridor.itinerary_adjust_corridor_fallback_level = corridorPool.fallbackLevel;
      metaCorridor.itinerary_adjust_spatial_effective = corridorPool.spatial;
    }
    let scored: unknown[];
    if (skipGeoClusterForDiversity) {
      scored = rankedForCorridor.slice(0, topNLimit);
    } else if (adjustSpatialEffective) {
      scored = selectClusteredPoisAlongCorridor(
        rankedForCorridor,
        topNLimit,
        adjustSpatialEffective,
        {
        maxLegKm: /冰岛|iceland/i.test(destinationRaw) ? 70 : 45,
      },
      );
      (state.metadata as Record<string, unknown>).itinerary_adjust_corridor_selection = true;
    } else {
      scored = host.selectClusteredPois(
        rankedForCorridor,
        topNLimit,
        startCoordinates,
        destinationRaw,
      );
    }
    /** Phase 2.6：最后一跳强制锚点进入 TopN（候选来自 rankedPois；与聚类解耦） */
    if (destinationCountry === 'IS' && requiredAnchors.length > 0 && !adjustSpatialEffective) {
      const beforeLen = scored.length;
      scored = enforceRequiredAnchorsTopN(
        scored,
        rankedPois,
        requiredAnchors,
        topNLimit,
        {
          createFallbackForSlug: (slug) =>
            host.buildPoiPlanningAnchorFallbackStub(slug),
        },
      );
      host.logger.debug(
        `[POI_PLANNING_ADMISSION] required=${JSON.stringify(requiredAnchors)} clustered_len=${beforeLen} final_len=${scored.length}`,
      );
    }

    if (preferOffbeat) {
      scored = enforceOffBeatQuotaInTopN(scored, rankedForCorridor, topNLimit);
      (state.metadata as Record<string, unknown>).poi_offbeat_quota_applied = true;
    }

    const sparsePoiGate = applySparseRegionPoiGate({
      scored: scored as Record<string, unknown>[],
      destinationCountry,
      destinationHint: destinationRaw,
      dedupe: (pois) => host.dedupePois(pois) as Record<string, unknown>[],
    });
    scored = sparsePoiGate.scored;
    attachSparseRegionMetadata(state.metadata as Record<string, unknown>, sparsePoiGate);

    const sparseProfile = sparsePoiGate.sparseProfile;
    if (sparseProfile && planningTextForDiversity.trim()) {
      const discovery = await runOpenWorldDiscoveryPipeline(
        {
          userMessage: planningTextForDiversity,
          countryCode: destinationCountry,
          destinationHint: destinationRaw,
          regionTags: [sparseProfile.regionTag],
          existingPoiEvidence: scored as unknown[],
          existingStubIds: (sparsePoiGate.openWorldStubs ?? []).map((s) => s.stubId),
        },
        { llmService: host.llmService },
      );
      if (discovery.stubs.length > 0) {
        scored = host.dedupePois(
          mergeDiscoveryStubsIntoPoiEvidence(scored as unknown[], discovery.stubs),
        );
        const meta = state.metadata as Record<string, unknown>;
        meta.open_world_discovery = discovery;
        meta.open_world_discovery_applied_at = new Date().toISOString();
        meta.open_world_stubs = [...(sparsePoiGate.openWorldStubs ?? []), ...discovery.stubs];
      } else if (discovery.mentions.length > 0) {
        const meta = state.metadata as Record<string, unknown>;
        meta.open_world_discovery = discovery;
        meta.open_world_discovery_applied_at = new Date().toISOString();
      }
    }

    const admissionDiag: PoiPlanningAdmissionDiagnosticsInput | undefined =
      buildPoiPlanningAdmissionDiagnostics(
        decisionState?.poiPlanning,
        withPlanning,
        rankedPois,
        scored,
      ) ?? undefined;

    annotateRetrievalTraceAfterPoiSelection(state.research_data?.retrieval_decision_trace);

    const gapBehaviorObs = buildGapBehaviorObservation({
      trace: state.research_data?.retrieval_decision_trace as RetrievalDecisionTrace | undefined,
      selectedPois: scored,
    });
    if (gapBehaviorObs) {
      (state.metadata as Record<string, unknown>).gap_behavior_observation = {
        ...gapBehaviorObs,
        ts: new Date().toISOString(),
      };
    }

    host.recordPoiPlanningOutcomeAfterSelection(state, decisionState, scored, admissionDiag);

    if (state.metadata?.show_poi_trace) {
      const selectedForTrace = scored
        .slice(0, 4)
        .map((x) => host.toPoiTraceNode(x));
      const metaObs = state.metadata as Record<string, unknown>;
      state.metadata.poi_trace = {
        ...(state.metadata.poi_trace || {}),
        policy: poiPolicy,
        sourceHint: state.metadata?.poi_source_hint,
        inputCount: asArray.length,
        selectedCount: scored.length,
        selected_region: destinationRaw || undefined,
        destination_country: destinationCountry,
        recall_raw_research: asArray.length,
        recall_after_route_augment: asArray.length,
        after_dedupe: deduped.length,
        after_hard_guards: scoredRows.length,
        selected_after_rank: scored.length,
        country_filter_applied: Boolean(destinationCountry),
        /** Phase 1.6：固定可观测块（与 docs/POI_REGION_INTENT_EVAL.md 对齐） */
        poi_planning_trace: decisionState?.poiPlanning
          ? {
              regionId: decisionState.poiPlanning.routeIntent?.regionId,
              resolution: decisionState.poiPlanning.resolution,
              feasibility: decisionState.poiPlanning.schedulePlan?.feasibility,
              budgetGateApplied: decisionState.poiPlanning.budgetGateApplied,
              appliedBackoffSteps: decisionState.poiPlanning.appliedBackoffSteps,
              narrationHint: decisionState.poiPlanning.narrationHint,
            }
          : undefined,
        poiPlanningExcludedFilteredCount: metaObs.poiPlanningExcludedFilteredCount,
        poiPlanningEnrichmentDisabled: metaObs.poiPlanningEnrichmentDisabled,
        score_reasons_top: scoredRows.slice(0, 8).map((x: any) => ({
          rank: x.idx + 1,
          reasons: x.poi?.poi_planning_score_reasons ?? [],
        })),
        debug_scores: scoredRows.slice(0, 12).map((x: any) => ({
          slot: `RANK_${x.idx + 1}`,
          desiredType: String(x.poi?.category ?? x.poi?.type ?? 'poi'),
          poiName: String(x.poi?.name ?? ''),
          typeScore: 0,
          timeScore: x.openingHoursBonus,
          ratingScore: 0,
          affordabilityScore: x.dataCompletenessBonus,
          nameHintScore: 0,
          commuteDistanceKm: undefined,
          commuteMinutes: undefined,
          commutePenalty: x.riskPenalty,
          timeWindowPenalty: 0,
          totalScore: Number((x.score ?? 0).toFixed(2)),
          score_reasons: x.poi?.poi_planning_score_reasons ?? [],
        })),
        commute_matrix:
          state.metadata?.show_commute_matrix === true
            ? host.buildPoiTraceCommuteMatrix(
                selectedForTrace,
                state.trip_plan_request?.mode as any,
                startCoordinates,
              )
            : undefined,
      };
    }

    const commuteBudgetMinutes = 240;
    const estimatedCommuteMinutes = host.estimateNearestTotalCommuteMinutes(
      scored.map((x) => host.toPoiTraceNode(x)),
      state.trip_plan_request?.mode as any,
      startCoordinates,
    );
    const skipCommuteClarifyForItineraryAdjust =
      shouldSkipPoiDestinationClarificationForItineraryAdjust(
        routeIntent?.primary,
        boundTripPoiSeedCount,
      );
    if (
      estimatedCommuteMinutes > commuteBudgetMinutes &&
      !skipCommuteClarifyForItineraryAdjust
    ) {
      const destinationExample = destinationRaw || '雷克雅未克';
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `估算单日通勤约 ${estimatedCommuteMinutes} 分钟，超过预算 ${commuteBudgetMinutes} 分钟，请补充更具体的城市/区域（例如：${destinationExample} 市区）`,
        } as any,
      ];
      state.clarification_questions = [
        {
          id: 'destination_scope_refine',
          question:
            '当前目的地范围过大，单日通勤过长。请选择更聚焦的区域继续规划：',
          type: 'single_choice',
          options: buildDestinationScopeClarificationOptions(destinationExample),
          required: true,
        } as any,
      ];
      if (state.metadata?.show_poi_trace) {
        state.metadata.poi_trace = {
          ...(state.metadata.poi_trace || {}),
          commute_budget_minutes: commuteBudgetMinutes,
          estimated_commute_minutes: estimatedCommuteMinutes,
          over_budget: true,
        };
      }
      return {
        needsClarification: true,
        allowWithFallback: false,
      };
    }

    const minPoiRequired = sparsePoiGate.minPoiRequired;
    const skipSparseForItineraryAdjust = shouldSkipPoiDestinationClarificationForItineraryAdjust(
      routeIntent?.primary,
      boundTripPoiSeedCount,
      minPoiRequired > 0 ? minPoiRequired : 2,
    );
    if (skipSparseForItineraryAdjust && scored.length < minPoiRequired) {
      scored = rankedPois.slice(0, Math.max(minPoiRequired, scored.length));
    }
    if (scored.length > 0 && scored.length < minPoiRequired && !skipSparseForItineraryAdjust) {
      const destinationExample = destinationRaw || '雷克雅未克';
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `当前可执行 POI 仅 ${scored.length} 个（至少需要 ${minPoiRequired} 个），请补充更具体的城市/区域（例如：${destinationExample} 市区）`,
        } as any,
      ];
      state.clarification_questions = [
        {
          id: 'destination_scope_too_sparse',
          question:
            '当前目的地范围过大或过散，候选点不足以生成可执行单日行程。请选择更聚焦区域：',
          type: 'single_choice',
          options: buildDestinationScopeClarificationOptions(destinationExample),
          required: true,
        } as any,
      ];
      if (state.metadata?.show_poi_trace) {
        state.metadata.poi_trace = {
          ...(state.metadata.poi_trace || {}),
          min_poi_required: minPoiRequired,
          selected_too_sparse: true,
        };
      }
      return {
        needsClarification: true,
        allowWithFallback: false,
      };
    }

    if (destinationCountry && scored.length === 0) {
      if (sparsePoiGate.sparseProfile) {
        (state.metadata as Record<string, unknown>).sparse_region_no_poi_fallback = true;
      } else {
      const destinationExample = destinationRaw ? `${destinationRaw} ${host.countryDisplayName(destinationCountry)}` : 'Tokyo, Japan';
      const fallbackDecision = {
        verdict: 'ALLOW_WITH_FALLBACK',
        reason: 'NO_POI_DATA',
      };
      state.gaps = [
        ...(state.gaps || []),
        {
          type: 'MISSING_DESTINATION',
          severity: 'HARD',
          detail: `未找到与目的地国家(${destinationCountry})一致的 POI，请明确国家/城市（例如：${destinationExample}）`,
        } as any,
      ];
      state.clarification_questions = [
        host.buildPoiCountryClarificationQuestion(destinationRaw, destinationCountry) as any,
      ];
      state.metadata.fallback_decision = fallbackDecision;
      state.metadata.fallback_explain = {
        summary: '由于缺少POI数据，系统采用城市探索策略',
        reasoning: [
          `目的地明确（${destinationRaw || '未提供'}）`,
          '未获取到可用POI数据',
          '触发Fallback机制',
        ],
      };
      if (requirePoiData) {
        state.gaps = [
          ...(state.gaps || []),
          {
            type: 'MISSING_DESTINATION',
            severity: 'HARD',
            detail: '已启用 require_poi_data：POI 数据为空，需补充目的地或扩展检索范围',
          } as any,
        ];
        return {
          needsClarification: true,
          allowWithFallback: false,
        };
      }
      }
    }

    persistSelectedPoisToResearchData(state, rawPoiEvidence, scored);
    if (decisionState) {
      const hydrated = syncDecisionContextToDecisionState(decisionState, state);
      decisionState.constraints = hydrated.constraints;
    }
    if (isFullTripReplan && state.research_data && typeof state.research_data === 'object') {
      state.research_data = {
        ...(state.research_data as Record<string, unknown>),
        __itinerary_full_trip_replan: true,
      } as OrchestratorState['research_data'];
    }
    if (
      adjustTargetDateIso &&
      adjustNeighborAnchors &&
      adjustSpatialEffective &&
      state.research_data &&
      typeof state.research_data === 'object'
    ) {
      state.research_data = applyCorridorResearchMarkers(
        state.research_data as Record<string, unknown>,
        adjustTargetDateIso,
        adjustNeighborAnchors,
        adjustSpatialEffective,
        adjustNeighborAnchors.targetDayNumber,
        scored,
      ) as OrchestratorState['research_data'];
    }

    const tripCtx = extractDecisionLogTripContext({
      tripPlanRequest: state.trip_plan_request,
      metadata: state.metadata as Record<string, unknown>,
    });
    if (isItineraryAdjust) {
      tripCtx.selectedPoiNames = extractPoiNamesFromScoredRows(scored);
    }

    const poiSelectionOutputs = isItineraryAdjust
      ? formatPoiSelectionOutputsAdjustZh({
          researchRecallCount: asArray.length,
          scoringPoolCount: deduped.length,
          selectedCount: scored.length,
          selectedNames: extractPoiNamesFromScoredRows(scored),
          metadata: state.metadata as Record<string, unknown>,
        })
      : formatPoiSelectionOutputsZh(asArray.length, scored.length, tripCtx);

    state.decision_log.push({
      request_id: state.request_id,
      step: 'POI_SELECTION',
      actor: 'Planner',
      inputs_summary: formatPoiSelectionInputsZh(asArray.length, tripCtx),
      outputs_summary: poiSelectionOutputs,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        destination: destinationRaw || undefined,
        destination_country: destinationCountry || undefined,
        input_count: asArray.length,
        deduped_count: deduped.length,
        selected_count: scored.length,
        ...(isItineraryAdjust
          ? buildItineraryAdjustAuditMetadata(state.metadata as Record<string, unknown>, {
              selected_poi_names: extractPoiNamesFromScoredRows(scored),
            })
          : {}),
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await host.generateDecisionStepForStep(state, 'POI_SELECTION', 'Planner');
    const allowWithFallback = poiPolicy !== 'strict' && !!(destinationRaw && scored.length === 0);
    return {
      needsClarification: false,
      allowWithFallback,
    };
}
