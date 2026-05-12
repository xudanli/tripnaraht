/**
 * ResearchExecutorService
 *
 * 实现 IResearchExecutor，执行 RESEARCH 阶段
 * 调用 Skills + WorldModelCollector + PredictionCollector
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState, EnvironmentState } from '../../decision/kernel/decision-state.types';
import type {
  IResearchExecutor,
  PhaseExecutorContext,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { WorldModelCollectorService } from './shared/world-model-collector.service';
import { PredictionCollectorService } from './shared/prediction-collector.service';
import { getSkillFailureStrategy } from '../utils/skill-importance.util';
import {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
} from '../../planning-policy/utils/build-candidate-retrieval-query-plan.util';
import { buildPoiSearchContext } from '../../planning-policy/utils/build-poi-search-context.util';
import {
  buildContextualPoiSearchQuerySuffix,
  filterPoisByRejectedIds,
} from '../../planning-policy/utils/contextual-poi-search-query.util';
import {
  buildFailedRetrievalTrace,
  buildPlanningRetrievalDecisionTrace,
} from '../../planning-policy/utils/build-retrieval-decision-trace.util';
import { detectItineraryGapsV1, gapRetrievalIntentQuerySuffix } from '../../planning-policy/utils/detect-itinerary-gaps.util';
import { GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY } from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import { calculateEnvironmentRisk, getWeatherForTime } from '../../trips/ontology/environment/environment-domain.util';
import { ContextHydrationService } from './shared/context-hydration.service';
import { TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH, TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY } from './shared/transport-evidence-messages';
import { normalizeTransportEndpointsForSkill } from './shared/transport-endpoint-hydration.util';
import { ResearchWorldFactShadowIngestorService } from '../../world-facts/research-world-fact-shadow-ingestor.service';
import { resolveResearchPoiBaseQueryHint } from '../utils/research-poi-retrieval-geography-hint.util';

@Injectable()
export class ResearchExecutorService implements IResearchExecutor {
  private readonly logger = new Logger(ResearchExecutorService.name);

  constructor(
    private readonly worldModelCollector: WorldModelCollectorService,
    private readonly predictionCollector: PredictionCollectorService,
    private readonly contextHydration: ContextHydrationService,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional()
    private readonly worldFactShadowIngest?: ResearchWorldFactShadowIngestorService,
  ) {}

  private finiteNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }

  private cloneResearchPrior(prior: Record<string, unknown>): Record<string, unknown> {
    const sc = (globalThis as any).structuredClone as ((x: unknown) => unknown) | undefined;
    try {
      if (sc) return sc(prior) as Record<string, unknown>;
    } catch {
      // fall through
    }
    try {
      return JSON.parse(JSON.stringify(prior)) as Record<string, unknown>;
    } catch {
      return { ...prior };
    }
  }

  private setWindSpeedMeta(
    researchData: Record<string, unknown>,
    meta: {
      source: 'failure_risk_prediction' | 'weather_predictions' | 'weather_forecast';
      aggregation: 'mean' | 'max' | 'p90';
      sampleCount: number;
      /** 当 aggregation=p90 时记录分位数算法定义，避免口径争议 */
      quantileMethod?: 'ceil-index';
      /** 可追溯证据引用（用于 external/internal 判定与回放） */
      evidence?: { ids: string[]; sources?: string[] };
    },
  ): void {
    (researchData as any).windSpeedMs_meta = meta;
  }

  private windAggregation(): 'mean' | 'max' | 'p90' {
    const v = String(process.env.DECISION_OS_WIND_AGG ?? 'mean').toLowerCase();
    return v === 'max' ? 'max' : v === 'p90' ? 'p90' : 'mean';
  }

  private aggregateWind(values: number[], agg: 'mean' | 'max' | 'p90'): number | undefined {
    if (!values.length) return undefined;
    if (agg === 'max') return Math.max(...values);
    if (agg === 'p90') {
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.9 * sorted.length) - 1));
      return sorted[idx];
    }
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 从 RESEARCH 输出中抽取「独立通道」的观测风速（m/s），并写入 researchData.windSpeedMs。
   * 优先级（按更“独立/更原始”优先）：
   * - failure_risk_prediction.predictions[].windSpeed (m/s) 取均值
   * - weather_predictions[].windSpeed (m/s) 取均值
   * - weather_forecast.forecasts[].wind.speed_kmh (km/h -> m/s) 取均值
   */
  private deriveWindSpeedMs(researchData: Record<string, unknown>): number | undefined {
    const aggregation = this.windAggregation();
    const frp = researchData.failure_risk_prediction as any;
    const preds = Array.isArray(frp?.predictions) ? frp.predictions : undefined;
    if (preds?.length) {
      const ws = preds.map((p: any) => this.finiteNumber(p?.windSpeed)).filter((n: any) => n !== undefined) as number[];
      if (ws.length > 0) {
        const frpEvidenceId = (researchData as any).failure_risk_prediction_evidence_id;
        const frpEvidenceSource = (researchData as any).failure_risk_prediction_evidence_source;
        this.setWindSpeedMeta(researchData, {
          source: 'failure_risk_prediction',
          aggregation,
          sampleCount: ws.length,
          quantileMethod: aggregation === 'p90' ? 'ceil-index' : undefined,
          evidence:
            typeof frpEvidenceId === 'string' && frpEvidenceId.trim()
              ? { ids: [frpEvidenceId], sources: typeof frpEvidenceSource === 'string' ? [frpEvidenceSource] : undefined }
              : undefined,
        });
        return this.aggregateWind(ws, aggregation);
      }
    }

    const wp = researchData.weather_predictions as any;
    if (Array.isArray(wp) && wp.length > 0) {
      const ws = wp.map((p: any) => this.finiteNumber(p?.windSpeed)).filter((n: any) => n !== undefined) as number[];
      if (ws.length > 0) {
        const wpEvidenceId = (researchData as any).weather_predictions_evidence_id;
        const wpEvidenceSource = (researchData as any).weather_predictions_evidence_source;
        this.setWindSpeedMeta(researchData, {
          source: 'weather_predictions',
          aggregation,
          sampleCount: ws.length,
          quantileMethod: aggregation === 'p90' ? 'ceil-index' : undefined,
          evidence:
            typeof wpEvidenceId === 'string' && wpEvidenceId.trim()
              ? { ids: [wpEvidenceId], sources: typeof wpEvidenceSource === 'string' ? [wpEvidenceSource] : undefined }
              : undefined,
        });
        return this.aggregateWind(ws, aggregation);
      }
    }

    const wf = researchData.weather_forecast as any;
    const fs = Array.isArray(wf?.forecasts) ? wf.forecasts : undefined;
    if (fs?.length) {
      const kmhs = fs
        .map((f: any) => this.finiteNumber(f?.wind?.speed_kmh))
        .filter((n: any) => n !== undefined) as number[];
      if (kmhs.length > 0) {
        const ms = kmhs.map((k) => k / 3.6);
        const ev = Array.isArray(wf?.evidence) ? wf.evidence : [];
        const evidenceIds = ev.map((e: any) => e?.evidence_id).filter(Boolean);
        const evidenceSources = ev.map((e: any) => e?.source).filter(Boolean);
        this.setWindSpeedMeta(researchData, {
          source: 'weather_forecast',
          aggregation,
          sampleCount: ms.length,
          quantileMethod: aggregation === 'p90' ? 'ceil-index' : undefined,
          evidence: evidenceIds.length > 0 ? { ids: evidenceIds, sources: evidenceSources } : undefined,
        });
        return this.aggregateWind(ms, aggregation);
      }
    }

    return undefined;
  }

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    researchData: Record<string, unknown>;
    environmentPatch: Partial<EnvironmentState>;
  }> {
    this.logger.debug(`[ResearchExecutor] 执行 RESEARCH 阶段 requestId=${ctx.requestId}`);

    const researchMode = ctx.researchMode ?? 'full';
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    let effectiveTrip = ctx.tripPlanRequest;

    if (researchMode === 'transport_only' && ctx.priorResearchData && typeof ctx.priorResearchData === 'object') {
      Object.assign(researchData, this.cloneResearchPrior(ctx.priorResearchData as Record<string, unknown>));
      this.logger.debug(`[ResearchExecutor] transport_only: merged prior research keys=${Object.keys(researchData).join(',')}`);
    }

    if (ctx.tripPlanRequest) {
      const hydration = this.contextHydration.hydrateTripPlanForTransport(dso, ctx.tripPlanRequest, {
        recentMessages: ctx.recent_messages,
      });
      effectiveTrip = hydration.trip ?? ctx.tripPlanRequest;
      if (hydration.patchedFields.length > 0) {
        researchData.transport_endpoint_hydration = {
          fields: hydration.patchedFields,
          provenance: hydration.provenance,
          ...(hydration.derived_from_history?.length
            ? {
                derived_from_history: hydration.derived_from_history,
                fact_signature: hydration.fact_signature,
              }
            : {}),
          ...(hydration.geo_context_hint ? { geo_context_hint: hydration.geo_context_hint } : {}),
        };
        this.logger.debug(
          `[ResearchExecutor] transport 端点已回填: ${hydration.patchedFields.join(',')} provenance=${JSON.stringify(hydration.provenance ?? {})}`,
        );
      }

      // 1. transport.search
      await this.runTransportSearch(effectiveTrip, researchData, evidenceRefs);

      if (researchMode !== 'transport_only') {
        // 2. poi.search
        await this.runPoiSearch(dso, effectiveTrip, researchData, evidenceRefs, ctx.itinerary, ctx.recent_messages);

        // 3. opening_hours.get
        await this.runOpeningHours(researchData, evidenceRefs);

        // 4. dem.get_profile
        await this.runDemProfile(effectiveTrip, researchData);

        // 5. geo.check.hazard.zones
        await this.runGeoHazardZones(effectiveTrip, researchData);

        // 6. Domain Agents - World Model
        await this.worldModelCollector.collect(
          {
            destination: effectiveTrip.destination,
            date_range: effectiveTrip.date_range,
            party: effectiveTrip.party,
          },
          researchData,
          evidenceRefs,
        );

        // 7. Prediction data
        await this.predictionCollector.collect(
          {
            date_range: effectiveTrip.date_range,
            party_profile: effectiveTrip.party_profile,
          },
          researchData,
          evidenceRefs,
          { route_direction_id: ctx.routeDirectionId, user_id: ctx.userId },
        );
      }
    }

    // 科学严谨性增强：补齐 windSpeedMs 独立观测通道（供 POMDP 似然更新使用）
    const windSpeedMs = this.deriveWindSpeedMs(researchData);
    if (windSpeedMs !== undefined) {
      researchData.windSpeedMs = windSpeedMs;
    }

    // 从 researchData 提取 environmentPatch
    const environmentPatch = this.extractEnvironmentPatch(researchData, effectiveTrip);

    // Parallel shadow write：Canonical WorldFact（不改 researchData、不经 Gate）
    if (this.worldFactShadowIngest) {
      void this.worldFactShadowIngest.ingestFromResearchOutput({
        researchData,
        requestId: ctx.requestId,
        countryCode: dso.environmentState?.countryCode,
        routeDirectionId: ctx.routeDirectionId,
      });
    }

    return { researchData, environmentPatch };
  }

  private async runTransportSearch(
    tripRequest: PhaseExecutorContext['tripPlanRequest'],
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
  ): Promise<void> {
    const normalized = normalizeTransportEndpointsForSkill(tripRequest);
    if (!this.skillsRegistry || !normalized) return;
    try {
      const skill = this.skillsRegistry.getSkill('transport.search');
      if (!skill) return;
      const result = await skill.execute({
        origin: normalized.origin,
        destination: normalized.destination,
        mode: tripRequest?.mode || 'mixed',
      });
      researchData.transport_evidence = result;
      if (result?.evidence_id) evidenceRefs.push(result.evidence_id);
    } catch (e: any) {
      const strategy = getSkillFailureStrategy('transport.search', e);
      if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
        researchData.transport_evidence = {
          missing: true,
          error: e?.message,
          degraded: true,
          user_guidance: TRANSPORT_SEARCH_DEGRADED_USER_GUIDANCE_ZH,
          suggested_action: TRANSPORT_SEARCH_SUGGESTED_ACTION_CLARIFY,
        };
      } else if (strategy.shouldReject) throw new Error(strategy.errorMessage);
      else if (strategy.shouldMarkMissing) {
        researchData.transport_evidence = { missing: true, error: e?.message };
      }
    }
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
      } as any);
      const generalResult = await skill.execute({
        query: generalQuery,
        limit: 12,
        lat,
        lng,
      });

      const scenicPois = Array.isArray(scenicResult?.pois)
        ? scenicResult.pois
        : Array.isArray(scenicResult)
          ? scenicResult
          : [];
      const generalPois = Array.isArray(generalResult?.pois)
        ? generalResult.pois
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
        } as any);
        const anchorPois = Array.isArray(anchorResult?.pois)
          ? anchorResult.pois
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
        } as any);
        const pairPois = Array.isArray(pairResult?.pois)
          ? pairResult.pois
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
        retrievalReason: 'kernel:ResearchExecutorService.runPoiSearch',
      });
      merged.forEach((p: any) => p?.evidence_id && evidenceRefs.push(p.evidence_id));
    } catch (e: any) {
      const strategy = getSkillFailureStrategy('poi.search', e);
      if (strategy.shouldMarkMissing) researchData.poi_evidence = { missing: true, error: e?.message };
      researchData.retrieval_decision_trace = buildFailedRetrievalTrace({
        kind: 'planning',
        message: `poi.search_failed:${e?.message ?? 'unknown'}`,
        poiSearchCtx: poiSearchCtxForTrace,
      });
    }
  }

  private async runOpeningHours(
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
  ): Promise<void> {
    const poiEvidence = researchData.poi_evidence;
    if (!this.skillsRegistry || !poiEvidence || (poiEvidence as any).missing) return;
    try {
      const skill = this.skillsRegistry.getSkill('opening_hours.get');
      if (!skill) return;
      let poiIds: string[] = [];
      if (Array.isArray(poiEvidence)) {
        poiIds = poiEvidence.slice(0, 5).map((p: any) => p.poi_id || p.id || p.place_id).filter(Boolean);
      } else if ((poiEvidence as any).pois?.length) {
        poiIds = (poiEvidence as any).pois.slice(0, 5).map((p: any) => p.poi_id || p.id || p.place_id).filter(Boolean);
      }
      if (poiIds.length === 0) return;
      const result = await skill.execute({ poi_ids: poiIds });
      researchData.opening_hours_evidence = result?.opening_hours ?? result;
      if (result?.opening_hours?.length) {
        result.opening_hours.forEach((item: any) => item.evidence_id && evidenceRefs.push(item.evidence_id));
      }
    } catch (e: any) {
      const strategy = getSkillFailureStrategy('opening_hours.get', e);
      if (strategy.shouldMarkMissing) researchData.opening_hours_evidence = { missing: true, error: e?.message };
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
    } catch (e: any) {
      if (!getSkillFailureStrategy('dem.get_profile', e).shouldIgnore) {
        this.logger.warn(`[ResearchExecutor] dem.get_profile 失败: ${e?.message}`);
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
    } catch (e: any) {
      if (!getSkillFailureStrategy('geo.check.hazard.zones', e).shouldIgnore) {
        this.logger.warn(`[ResearchExecutor] geo.check.hazard.zones 失败: ${e?.message}`);
      }
    }
  }

  private extractEnvironmentPatch(
    researchData: Record<string, unknown>,
    tripRequest?: PhaseExecutorContext['tripPlanRequest'],
  ): Partial<EnvironmentState> {
    const env: Partial<EnvironmentState> = {};
    if (researchData.countryCode || researchData.country_code) {
      env.countryCode = (researchData.countryCode ?? researchData.country_code) as string;
    }
    if (researchData.route_direction_id || researchData.routeDirectionId) {
      env.routeDirectionId = (researchData.route_direction_id ?? researchData.routeDirectionId) as string;
    }
    const rcw = researchData.routeCorridorWorld ?? researchData.route_corridor_world;
    if (rcw && typeof rcw === 'object' && !Array.isArray(rcw)) {
      env.routeCorridorWorld = rcw as EnvironmentState['routeCorridorWorld'];
      const rid = (rcw as { routeDirectionId?: string }).routeDirectionId;
      if (!env.routeDirectionId && typeof rid === 'string' && rid.trim()) {
        env.routeDirectionId = rid.trim();
      }
    }
    if (researchData.month !== undefined) {
      env.month = typeof researchData.month === 'number' ? researchData.month : parseInt(String(researchData.month), 10);
    } else if (tripRequest?.start_date) {
      env.month = new Date(tripRequest.start_date).getMonth() + 1;
    } else if (tripRequest?.date_range?.start_date) {
      env.month = new Date(tripRequest.date_range.start_date).getMonth() + 1;
    }
    if (researchData.road_conditions || researchData.roadConditions) {
      env.roadConditions = (researchData.road_conditions ?? researchData.roadConditions) as Record<string, unknown>;
    }
    if (researchData.weather_risk !== undefined || researchData.weatherRisk !== undefined) {
      env.weatherRisk = (researchData.weather_risk ?? researchData.weatherRisk) as number;
    }
    if (researchData.windSpeedMs !== undefined || (researchData as any).wind_speed_ms !== undefined) {
      const v = (researchData.windSpeedMs ?? (researchData as any).wind_speed_ms) as unknown;
      env.windSpeedMs = typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    }
    if ((researchData.failure_risk_prediction as any)?.predictions?.length) {
      const preds = (researchData.failure_risk_prediction as any).predictions;
      const hasHigh = preds.some((p: any) => p.riskLevel === 'HIGH');
      env.failureRiskLevel = hasHigh ? 'HIGH' : preds.some((p: any) => p.riskLevel === 'MODERATE' || p.riskLevel === 'MEDIUM') ? 'MEDIUM' : 'LOW';
    }
    if (researchData.crowd_level !== undefined || researchData.crowdLevel !== undefined) {
      const c = researchData.crowd_level ?? researchData.crowdLevel;
      env.crowdLevel = typeof c === 'number' ? Math.min(1, Math.max(0, c)) : undefined;
    }
    const daylights =
      researchData.daylight_by_date ??
      researchData.daylightByDate ??
      (researchData.weather_forecast as any)?.daylight_by_date ??
      (researchData.weather_forecast as any)?.daylightByDate;
    if (daylights && typeof daylights === 'object' && !Array.isArray(daylights)) {
      env.daylightByDate = daylights as EnvironmentState['daylightByDate'];
    }

    // Admin-injected solar overrides (RouteDirection.metadata.environment_overrides_v1), carried via world.physical.prefetched_evidence.
    // Priority: explicit overrides should win over auto-collected daylights, because they are used for signature lock + audit.
    try {
      const rd: any = researchData as any;
      const prefetched: any[] =
        (rd?.world?.physical?.prefetched_evidence as any[]) ??
        (rd?.world_build_context?.world?.physical?.prefetched_evidence as any[]) ??
        (rd?.worldModel?.physical?.prefetched_evidence as any[]) ??
        [];
      const list = Array.isArray(prefetched) ? prefetched : [];
      const envOverride = list.find((x) => x && typeof x === 'object' && (x as any).kind === 'environment_overrides_v1');
      const solar = envOverride?.overrides?.solar;
      const weather = envOverride?.overrides?.weather;
      if (solar && typeof solar === 'object') {
        const twilightBufferMin =
          solar.twilightBufferMin ?? solar.twilight_buffer_min ?? solar.twilightBuffer ?? solar.twilight_buffer;
        if (typeof twilightBufferMin === 'number' && Number.isFinite(twilightBufferMin)) {
          (env as any).twilightBufferMin = Math.round(twilightBufferMin);
        }

        const mergeDaylight = (date: string, patch: any) => {
          const k = String(date).slice(0, 10);
          if (!k) return;
          const cur = (env.daylightByDate?.[k] ?? {}) as any;
          env.daylightByDate = { ...(env.daylightByDate ?? {}), [k]: { ...cur, ...patch } };
        };

        // Option A: full daylightByDate shape.
        const overrideDaylightByDate = solar.daylightByDate ?? solar.daylight_by_date;
        if (overrideDaylightByDate && typeof overrideDaylightByDate === 'object' && !Array.isArray(overrideDaylightByDate)) {
          for (const [k, v] of Object.entries(overrideDaylightByDate as any)) {
            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            mergeDaylight(k, {
              ...(typeof (v as any).sunrise === 'string' ? { sunrise: String((v as any).sunrise) } : {}),
              ...(typeof (v as any).sunset === 'string' ? { sunset: String((v as any).sunset) } : {}),
              ...(typeof (v as any).civil_dusk === 'string' ? { civil_dusk: String((v as any).civil_dusk) } : {}),
              ...(typeof (v as any).civilDusk === 'string' ? { civil_dusk: String((v as any).civilDusk) } : {}),
            });
          }
        }

        // Option B: partial maps.
        const sunsetByDate = solar.sunsetByDate ?? solar.sunset_by_date;
        if (sunsetByDate && typeof sunsetByDate === 'object' && !Array.isArray(sunsetByDate)) {
          for (const [k, v] of Object.entries(sunsetByDate as any)) {
            if (typeof v === 'string' && v.trim()) mergeDaylight(k, { sunset: v.trim() });
          }
        }
        const civilDuskByDate = solar.civilDuskByDate ?? solar.civil_dusk_by_date ?? solar.civilDusk_by_date;
        if (civilDuskByDate && typeof civilDuskByDate === 'object' && !Array.isArray(civilDuskByDate)) {
          for (const [k, v] of Object.entries(civilDuskByDate as any)) {
            if (typeof v === 'string' && v.trim()) mergeDaylight(k, { civil_dusk: v.trim() });
          }
        }
        const sunriseByDate = solar.sunriseByDate ?? solar.sunrise_by_date;
        if (sunriseByDate && typeof sunriseByDate === 'object' && !Array.isArray(sunriseByDate)) {
          for (const [k, v] of Object.entries(sunriseByDate as any)) {
            if (typeof v === 'string' && v.trim()) mergeDaylight(k, { sunrise: v.trim() });
          }
        }
      }

      // Environment risk score (spec-aligned): derive from weather + daylight windows when possible.
      // Keep backward compatibility: only fill when caller didn't provide weatherRisk explicitly.
      if (
        env.weatherRisk === undefined &&
        weather &&
        typeof weather === 'object' &&
        tripRequest &&
        ((tripRequest as any)?.date_range?.start_date || (tripRequest as any)?.start_date)
      ) {
        const eventTimeISO = String((tripRequest as any)?.date_range?.start_date ?? (tripRequest as any)?.start_date);
        let wv: any = weather;
        const series = Array.isArray((weather as any)?.forecastSeries)
          ? (weather as any).forecastSeries
          : Array.isArray((weather as any)?.forecast_series)
            ? (weather as any).forecast_series
            : [];
        if (series.length > 0) {
          const normalized = series
            .filter((x: any) => x && typeof x === 'object')
            .map((x: any) => ({
              locationId: String(x.locationId ?? x.location_id ?? ''),
              timeWindow: {
                start: String(x.start ?? x.timeWindow?.start ?? x.time_window?.start ?? ''),
                end: String(x.end ?? x.timeWindow?.end ?? x.time_window?.end ?? ''),
              },
              windSpeedKph:
                typeof x.windSpeedKph === 'number'
                  ? x.windSpeedKph
                  : typeof x.wind_speed_kph === 'number'
                    ? x.wind_speed_kph
                    : typeof x.wind_mps === 'number'
                      ? x.wind_mps * 3.6
                      : NaN,
              visibilityMeters:
                typeof x.visibilityMeters === 'number'
                  ? x.visibilityMeters
                  : typeof x.visibility_m === 'number'
                    ? x.visibility_m
                    : typeof x.visibility_meters === 'number'
                      ? x.visibility_meters
                      : NaN,
              precipitationMm:
                typeof x.precipitationMm === 'number'
                  ? x.precipitationMm
                  : typeof x.precipitation_mm === 'number'
                    ? x.precipitation_mm
                    : NaN,
              snowDepthCm:
                typeof x.snowDepthCm === 'number'
                  ? x.snowDepthCm
                  : typeof x.snow_depth_cm === 'number'
                    ? x.snow_depth_cm
                    : NaN,
              temperatureC: typeof x.temperatureC === 'number' ? x.temperatureC : NaN,
              condition: String(x.condition ?? 'CLEAR'),
              confidenceScore:
                typeof x.confidenceScore === 'number'
                  ? x.confidenceScore
                  : typeof x.confidence_score === 'number'
                    ? x.confidence_score
                    : 0,
              source: String(x.source ?? ''),
              updatedAt: String(x.updatedAt ?? x.updated_at ?? ''),
            }))
            .filter((x: any) => x.timeWindow.start && x.timeWindow.end);
          const selected = getWeatherForTime({ weatherForecasts: normalized as any, timeISO: eventTimeISO }) as any;
          if (selected) wv = selected;
        }

        const dateKey = eventTimeISO.slice(0, 10);
        const solarForRisk =
          env.daylightByDate?.[dateKey]?.sunset
            ? {
                locationId: env.routeDirectionId ?? env.countryCode ?? 'unknown',
                sunrise: env.daylightByDate?.[dateKey]?.sunrise ?? '',
                sunset: env.daylightByDate?.[dateKey]?.sunset ?? '',
                civilTwilightEnd: env.daylightByDate?.[dateKey]?.civil_dusk ?? undefined,
                daylightMinutes: 0,
              }
            : null;

        env.weatherRisk = calculateEnvironmentRisk({
          windSpeedKph:
            typeof wv?.windSpeedKph === 'number'
              ? wv.windSpeedKph
              : typeof wv?.wind_speed_kph === 'number'
                ? wv.wind_speed_kph
                : typeof wv?.wind_mps === 'number'
                  ? wv.wind_mps * 3.6
                  : null,
          visibilityMeters:
            typeof wv?.visibilityMeters === 'number'
              ? wv.visibilityMeters
              : typeof wv?.visibility_m === 'number'
                ? wv.visibility_m
                : typeof wv?.visibility_meters === 'number'
                  ? wv.visibility_meters
                  : null,
          precipitationMm:
            typeof wv?.precipitationMm === 'number'
              ? wv.precipitationMm
              : typeof wv?.precipitation_mm === 'number'
                ? wv.precipitation_mm
                : null,
          snowDepthCm:
            typeof wv?.snowDepthCm === 'number'
              ? wv.snowDepthCm
              : typeof wv?.snow_depth_cm === 'number'
                ? wv.snow_depth_cm
                : null,
          solar: solarForRisk as any,
          eventTimeISO,
          policy: {
            wind_drive_limit_kph: 50,
            min_visibility_m: 1000,
            snow_depth_limit_cm: 10,
            precipitation_limit_mm: 10,
            sunset_safety_buffer_min: (env as any).twilightBufferMin ?? 30,
          },
        });
      }
    } catch {
      // best-effort only
    }

    return env;
  }
}
