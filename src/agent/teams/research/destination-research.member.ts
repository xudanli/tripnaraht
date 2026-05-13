import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { WorldModelCollectorService } from '../../execution/shared/world-model-collector.service';
import { PredictionCollectorService } from '../../execution/shared/prediction-collector.service';
import { getSkillFailureStrategy } from '../../utils/skill-importance.util';
import {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
} from '../../../planning-policy/utils/build-candidate-retrieval-query-plan.util';
import { buildPoiSearchContext } from '../../../planning-policy/utils/build-poi-search-context.util';
import {
  buildContextualPoiSearchQuerySuffix,
  filterPoisByRejectedIds,
} from '../../../planning-policy/utils/contextual-poi-search-query.util';
import {
  buildFailedRetrievalTrace,
  buildPlanningRetrievalDecisionTrace,
} from '../../../planning-policy/utils/build-retrieval-decision-trace.util';
import { detectItineraryGapsV1, gapRetrievalIntentQuerySuffix } from '../../../planning-policy/utils/detect-itinerary-gaps.util';
import { GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY } from '../../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import { resolveResearchPoiBaseQueryHint } from '../../utils/research-poi-retrieval-geography-hint.util';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchMemberDestinationBundleInput } from './research-member-destination.types';
import { computeResearchPatchFromIsolation, deepCloneResearchData } from './research-context-manager';
import { ResearchTeamBusService } from './research-team-bus.service';
import { isResearchParallelAssignmentPayload } from './research-team-bus.types';

/**
 * 目的地域 Member：POI 检索、营业时间、DEM、风险区、世界模型与预测（Monolith 迁出）。
 */
@Injectable()
export class DestinationResearchMember implements OnModuleInit, OnModuleDestroy {
  readonly memberId = 'DestinationResearchMember' as const;

  private readonly logger = new Logger(DestinationResearchMember.name);
  private busOff?: () => void;

  constructor(
    private readonly worldModelCollector: WorldModelCollectorService,
    private readonly predictionCollector: PredictionCollectorService,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  onModuleInit(): void {
    if (!this.researchTeamBus) return;
    this.busOff = this.researchTeamBus.subscribeGlobalAssignments(async (env) => {
      if (!isResearchParallelAssignmentPayload(env.payload) || env.payload.memberKind !== 'destination') return;
      const p = env.payload;
      if (!p.dso) {
        this.logger.warn(`[DestinationResearchMember] bus assignment missing dso requestId=${env.requestId} slotId=${env.slotId}`);
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: false, error: 'missing_dso' });
        return;
      }
      try {
        const baselineRd = deepCloneResearchData(p.researchData);
        const baselineEr = [...p.evidenceRefs];
        await this.runDestinationBundle({
          requestId: env.requestId,
          routeDirectionId: p.routeDirectionId,
          userId: p.userId,
          dso: p.dso,
          tripPlanRequest: p.tripPlanRequest,
          researchData: p.researchData,
          evidenceRefs: p.evidenceRefs,
          itinerary: p.itinerary,
          recentMessages: p.recentMessages,
        });
        const patch = computeResearchPatchFromIsolation({
          baselineResearchData: baselineRd,
          isolatedResearchData: p.researchData,
          baselineEvidenceRefs: baselineEr,
          isolatedEvidenceRefs: p.evidenceRefs,
          scope: 'destination',
        });
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: true, patch });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `[DestinationResearchMember] bus assignment failed requestId=${env.requestId} slotId=${env.slotId} ${msg}`,
        );
        this.researchTeamBus!.publishCompletion(env.requestId, env.slotId, { ok: false, error: msg });
      }
    });
  }

  onModuleDestroy(): void {
    this.busOff?.();
    this.busOff = undefined;
  }

  async runDestinationBundle(input: ResearchMemberDestinationBundleInput): Promise<void> {
    const {
      dso,
      tripPlanRequest,
      researchData,
      evidenceRefs,
      itinerary,
      recentMessages,
      routeDirectionId,
      userId,
    } = input;
    await this.runPoiSearch(dso, tripPlanRequest, researchData, evidenceRefs, itinerary, recentMessages);
    await this.runOpeningHours(researchData, evidenceRefs);
    await this.runDemProfile(tripPlanRequest, researchData);
    await this.runGeoHazardZones(tripPlanRequest, researchData);
    await this.worldModelCollector.collect(
      {
        destination: tripPlanRequest.destination,
        date_range: tripPlanRequest.date_range,
        party: tripPlanRequest.party,
      },
      researchData,
      evidenceRefs,
    );
    await this.predictionCollector.collect(
      {
        date_range: tripPlanRequest.date_range,
        party_profile: tripPlanRequest.party_profile,
      },
      researchData,
      evidenceRefs,
      { route_direction_id: routeDirectionId, user_id: userId },
    );
  }

  private async runPoiSearch(
    dso: DecisionState,
    tripRequest: PhaseExecutorContext['tripPlanRequest'],
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
    itineraryLike?: PhaseExecutorContext['itinerary'],
    recentMessages?: string[],
  ): Promise<void> {
    if (!this.skillsRegistry || !tripRequest) return;
    let poiSearchCtxForTrace: ReturnType<typeof buildPoiSearchContext> | undefined;
    try {
      const skill = this.skillsRegistry.getSkill('poi.search');
      if (!skill) return;
      const destRaw = typeof tripRequest.destination === 'string' ? tripRequest.destination : 'destination';
      const normalized = destRaw.trim().toLowerCase();
      const ambiguousCityCountryMap: Record<string, string> = {
        '东京': '日本',
        tokyo: 'Japan',
        '大阪': '日本',
        osaka: 'Japan',
        '京都': '日本',
        kyoto: 'Japan',
        '首尔': '韩国',
        seoul: 'Korea',
      };
      const countryHint = ambiguousCityCountryMap[normalized];
      const baseQueryRaw = countryHint ? `${destRaw} ${countryHint}` : destRaw;
      const userMsgForRetrieval = Array.isArray(recentMessages)
        ? recentMessages.map((m) => String(m ?? '').trim()).filter(Boolean).join('\n')
        : '';
      const baseQuery =
        resolveResearchPoiBaseQueryHint({ tripDestination: destRaw, userMessage: userMsgForRetrieval }) ??
        baseQueryRaw;
      const plan = buildCandidateRetrievalQueryPlan(userMsgForRetrieval, baseQuery, dso.poiPlanning);
      const poiSearchCtx = buildPoiSearchContext({
        destination: tripRequest.destination,
        decisionState: dso,
        itinerary: itineraryLike,
        userMessage: userMsgForRetrieval,
      });
      poiSearchCtxForTrace = poiSearchCtx;
      const semanticGapsForQuery = detectItineraryGapsV1({
        poiSearchCtx,
        decisionState: dso,
        itinerary: itineraryLike,
      });
      const gapSuffix = gapRetrievalIntentQuerySuffix(semanticGapsForQuery);
      const ctxSuffix = buildContextualPoiSearchQuerySuffix(poiSearchCtx);
      const boost =
        plan.boostedTerms.length > 0 ? ` ${plan.boostedTerms.slice(0, 12).join(' ')}` : '';
      const scenicQuery = `${baseQuery} attractions landmark museum sightseeing${boost}${ctxSuffix}${gapSuffix}`
        .replace(/\s+/g, ' ')
        .trim();
      const generalQuery =
        plan.boostedTerms.length > 0
          ? `${baseQuery} ${plan.boostedTerms.slice(0, 8).join(' ')}${ctxSuffix}${gapSuffix}`.replace(/\s+/g, ' ').trim()
          : `${baseQuery}${ctxSuffix}${gapSuffix}`.replace(/\s+/g, ' ').trim();
      const lat =
        typeof tripRequest.destination === 'object' ? tripRequest.destination?.lat : undefined;
      const lng =
        typeof tripRequest.destination === 'object' ? tripRequest.destination?.lng : undefined;

      const scenicResult = await skill.execute({
        query: scenicQuery,
        limit: 12,
        lat,
        lng,
        category: 'ATTRACTION',
      } as Record<string, unknown>);
      const generalResult = await skill.execute({
        query: generalQuery,
        limit: 12,
        lat,
        lng,
      });

      const scenicPois = Array.isArray((scenicResult as { pois?: unknown })?.pois)
        ? (scenicResult as { pois: unknown[] }).pois
        : Array.isArray(scenicResult)
          ? scenicResult
          : [];
      const generalPois = Array.isArray((generalResult as { pois?: unknown })?.pois)
        ? (generalResult as { pois: unknown[] }).pois
        : Array.isArray(generalResult)
          ? generalResult
          : [];
      let merged = mergeResearchPoiLists(scenicPois, generalPois, 16);
      const extraSubQueries: Record<string, string> = {};
      if (plan.regionTags.includes('golden_circle') && plan.boostedTerms.length > 0) {
        const anchorQuery = `Iceland Golden Circle ${plan.boostedTerms.slice(0, 10).join(' ')}`;
        extraSubQueries.golden_circle_anchor = anchorQuery;
        const anchorResult = await skill.execute({
          query: anchorQuery,
          limit: 12,
          lat,
          lng,
          category: 'ATTRACTION',
        } as Record<string, unknown>);
        const anchorPois = Array.isArray((anchorResult as { pois?: unknown })?.pois)
          ? (anchorResult as { pois: unknown[] }).pois
          : Array.isArray(anchorResult)
            ? anchorResult
            : [];
        merged = mergeResearchPoiLists(anchorPois, merged, 22);
      }
      if (plan.regionTags.includes('golden_circle')) {
        extraSubQueries.golden_circle_pair = GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY;
        const pairResult = await skill.execute({
          query: GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY,
          limit: 14,
          lat,
          lng,
          category: 'ATTRACTION',
        } as Record<string, unknown>);
        const pairPois = Array.isArray((pairResult as { pois?: unknown })?.pois)
          ? (pairResult as { pois: unknown[] }).pois
          : Array.isArray(pairResult)
            ? pairResult
            : [];
        merged = mergeResearchPoiLists(pairPois, merged, 30);
      }
      merged = filterPoisByRejectedIds(merged, poiSearchCtx.rejectedPoiIds);
      researchData.poi_evidence = merged;
      const semanticGaps = semanticGapsForQuery;
      researchData.retrieval_decision_trace = buildPlanningRetrievalDecisionTrace({
        poiSearchCtx,
        scenicQuery,
        generalQuery,
        extraSubQueries: Object.keys(extraSubQueries).length ? extraSubQueries : undefined,
        mergedPoiCount: merged.length,
        semanticGaps,
        retrievalReason: 'kernel:DestinationResearchMember.runPoiSearch',
      });
      merged.forEach((p: { evidence_id?: string }) => p?.evidence_id && evidenceRefs.push(p.evidence_id));
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const strategy = getSkillFailureStrategy('poi.search', err);
      if (strategy.shouldMarkMissing) researchData.poi_evidence = { missing: true, error: err.message };
      researchData.retrieval_decision_trace = buildFailedRetrievalTrace({
        kind: 'planning',
        message: `poi.search_failed:${err.message ?? 'unknown'}`,
        poiSearchCtx: poiSearchCtxForTrace,
      });
    }
  }

  private async runOpeningHours(
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
  ): Promise<void> {
    const poiEvidence = researchData.poi_evidence;
    if (!this.skillsRegistry || !poiEvidence || (poiEvidence as { missing?: boolean }).missing) return;
    try {
      const skill = this.skillsRegistry.getSkill('opening_hours.get');
      if (!skill) return;
      let poiIds: string[] = [];
      if (Array.isArray(poiEvidence)) {
        poiIds = poiEvidence
          .slice(0, 5)
          .map((p: { poi_id?: string; id?: string; place_id?: string }) => p.poi_id || p.id || p.place_id)
          .filter(Boolean) as string[];
      } else if ((poiEvidence as { pois?: { length: number } }).pois?.length) {
        poiIds = (poiEvidence as { pois: Array<{ poi_id?: string; id?: string; place_id?: string }> }).pois
          .slice(0, 5)
          .map((p) => p.poi_id || p.id || p.place_id)
          .filter(Boolean) as string[];
      }
      if (poiIds.length === 0) return;
      const result = (await skill.execute({ poi_ids: poiIds })) as {
        opening_hours?: Array<{ evidence_id?: string }>;
      };
      researchData.opening_hours_evidence = result?.opening_hours ?? result;
      if (result?.opening_hours?.length) {
        result.opening_hours.forEach((item) => item.evidence_id && evidenceRefs.push(item.evidence_id));
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const strategy = getSkillFailureStrategy('opening_hours.get', err);
      if (strategy.shouldMarkMissing) researchData.opening_hours_evidence = { missing: true, error: err.message };
    }
  }

  private async runDemProfile(
    tripRequest: PhaseExecutorContext['tripPlanRequest'],
    researchData: Record<string, unknown>,
  ): Promise<void> {
    if (!this.skillsRegistry || !tripRequest?.destination) return;
    try {
      const skill = this.skillsRegistry.getSkill('dem.get_profile');
      if (!skill) return;
      researchData.dem_metrics = await skill.execute({
        destination: tripRequest.destination,
        origin: tripRequest.origin,
      } as Record<string, unknown>);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!getSkillFailureStrategy('dem.get_profile', err).shouldIgnore) {
        this.logger.warn(`[DestinationResearchMember] dem.get_profile 失败: ${err.message}`);
      }
    }
  }

  private async runGeoHazardZones(
    tripRequest: PhaseExecutorContext['tripPlanRequest'],
    researchData: Record<string, unknown>,
  ): Promise<void> {
    const coords = tripRequest && typeof tripRequest.destination === 'object' ? tripRequest.destination : undefined;
    if (!this.skillsRegistry || !coords) return;
    try {
      const skill = this.skillsRegistry.getSkill('geo.check.hazard.zones');
      if (!skill) return;
      researchData.risk_assessment = await skill.execute({ lat: coords.lat, lng: coords.lng });
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (!getSkillFailureStrategy('geo.check.hazard.zones', err).shouldIgnore) {
        this.logger.warn(`[DestinationResearchMember] geo.check.hazard.zones 失败: ${err.message}`);
      }
    }
  }
}
