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
import { isUnresolvedDestinationPlaceholder } from '../utils/clarification-question-generator.util';
import {
  buildCandidateRetrievalQueryPlan,
  mergeResearchPoiLists,
} from '../../planning-policy/utils/build-candidate-retrieval-query-plan.util';
import { GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY } from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';

@Injectable()
export class ResearchExecutorService implements IResearchExecutor {
  private readonly logger = new Logger(ResearchExecutorService.name);

  constructor(
    private readonly worldModelCollector: WorldModelCollectorService,
    private readonly predictionCollector: PredictionCollectorService,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
  ) {}

  private finiteNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
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

    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    const tripRequest = ctx.tripPlanRequest;

    if (tripRequest) {
      // 1. transport.search
      await this.runTransportSearch(tripRequest, researchData, evidenceRefs);

      // 2. poi.search
      await this.runPoiSearch(dso, tripRequest, researchData, evidenceRefs);

      // 3. opening_hours.get
      await this.runOpeningHours(researchData, evidenceRefs);

      // 4. dem.get.profile
      await this.runDemProfile(tripRequest, researchData);

      // 5. geo.check.hazard.zones
      await this.runGeoHazardZones(tripRequest, researchData);

      // 6. Domain Agents - World Model
      await this.worldModelCollector.collect(
        {
          destination: tripRequest.destination,
          date_range: tripRequest.date_range,
          party: tripRequest.party,
        },
        researchData,
        evidenceRefs,
      );

      // 7. Prediction data
      await this.predictionCollector.collect(
        {
          date_range: tripRequest.date_range,
          party_profile: tripRequest.party_profile,
        },
        researchData,
        evidenceRefs,
        { route_direction_id: ctx.routeDirectionId, user_id: ctx.userId },
      );
    }

    // 科学严谨性增强：补齐 windSpeedMs 独立观测通道（供 POMDP 似然更新使用）
    const windSpeedMs = this.deriveWindSpeedMs(researchData);
    if (windSpeedMs !== undefined) {
      researchData.windSpeedMs = windSpeedMs;
    }

    // 从 researchData 提取 environmentPatch
    const environmentPatch = this.extractEnvironmentPatch(researchData, tripRequest);

    return { researchData, environmentPatch };
  }

  private async runTransportSearch(
    tripRequest: PhaseExecutorContext['tripPlanRequest'],
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
  ): Promise<void> {
    if (
      !this.skillsRegistry ||
      !tripRequest ||
      typeof tripRequest.origin !== 'string' ||
      typeof tripRequest.destination !== 'string' ||
      isUnresolvedDestinationPlaceholder(tripRequest.destination)
    ) {
      return;
    }
    try {
      const skill = this.skillsRegistry.getSkill('transport.search');
      if (!skill) return;
      const result = await skill.execute({
        origin: tripRequest.origin,
        destination: tripRequest.destination,
        mode: tripRequest.mode || 'mixed',
      });
      researchData.transport_evidence = result;
      if (result?.evidence_id) evidenceRefs.push(result.evidence_id);
    } catch (e: any) {
      const strategy = getSkillFailureStrategy('transport.search', e);
      if (strategy.shouldDegrade && strategy.shouldMarkMissing) {
        researchData.transport_evidence = { missing: true, error: e?.message, degraded: true };
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
  ): Promise<void> {
    if (!this.skillsRegistry || !tripRequest) return;
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
      const baseQuery = countryHint ? `${destRaw} ${countryHint}` : destRaw;
      const plan = buildCandidateRetrievalQueryPlan('', baseQuery, dso.poiPlanning);
      const boost =
        plan.boostedTerms.length > 0 ? ` ${plan.boostedTerms.slice(0, 12).join(' ')}` : '';
      const scenicQuery = `${baseQuery} attractions landmark museum sightseeing${boost}`;
      const generalQuery =
        plan.boostedTerms.length > 0
          ? `${baseQuery} ${plan.boostedTerms.slice(0, 8).join(' ')}`
          : baseQuery;
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
      if (plan.regionTags.includes('golden_circle') && plan.boostedTerms.length > 0) {
        const anchorQuery = `Iceland Golden Circle ${plan.boostedTerms.slice(0, 10).join(' ')}`;
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
      researchData.poi_evidence = merged;
      merged.forEach((p: any) => p?.evidence_id && evidenceRefs.push(p.evidence_id));
    } catch (e: any) {
      const strategy = getSkillFailureStrategy('poi.search', e);
      if (strategy.shouldMarkMissing) researchData.poi_evidence = { missing: true, error: e?.message };
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
      const skill = this.skillsRegistry.getSkill('dem.get.profile');
      if (!skill) return;
      researchData.dem_metrics = await skill.execute({ destination: tripRequest.destination });
    } catch (e: any) {
      if (!getSkillFailureStrategy('dem.get.profile', e).shouldIgnore) {
        this.logger.warn(`[ResearchExecutor] dem.get.profile 失败: ${e?.message}`);
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
    return env;
  }
}
