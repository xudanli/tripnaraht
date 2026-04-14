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

@Injectable()
export class ResearchExecutorService implements IResearchExecutor {
  private readonly logger = new Logger(ResearchExecutorService.name);

  constructor(
    private readonly worldModelCollector: WorldModelCollectorService,
    private readonly predictionCollector: PredictionCollectorService,
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
  ) {}

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
      await this.runPoiSearch(tripRequest, researchData, evidenceRefs);

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
      const scenicQuery = `${baseQuery} attractions landmark museum sightseeing`;
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
        query: baseQuery,
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
      const merged = this.mergePoiCandidatesWithPriority(scenicPois, generalPois, 16);
      researchData.poi_evidence = merged;
      merged.forEach((p: any) => p?.evidence_id && evidenceRefs.push(p.evidence_id));
    } catch (e: any) {
      const strategy = getSkillFailureStrategy('poi.search', e);
      if (strategy.shouldMarkMissing) researchData.poi_evidence = { missing: true, error: e?.message };
    }
  }

  private mergePoiCandidatesWithPriority(
    primary: any[],
    secondary: any[],
    limit: number,
  ): any[] {
    const out: any[] = [];
    const seen = new Set<string>();
    const add = (items: any[]) => {
      for (const poi of items) {
        if (out.length >= limit) break;
        const key = `${poi?.poi_id ?? poi?.id ?? ''}|${String(poi?.name ?? '').toLowerCase()}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(poi);
      }
    };
    add(primary);
    add(secondary);
    return out;
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
    if ((researchData.failure_risk_prediction as any)?.predictions?.length) {
      const preds = (researchData.failure_risk_prediction as any).predictions;
      const hasHigh = preds.some((p: any) => p.riskLevel === 'HIGH');
      env.failureRiskLevel = hasHigh ? 'HIGH' : preds.some((p: any) => p.riskLevel === 'MODERATE' || p.riskLevel === 'MEDIUM') ? 'MEDIUM' : 'LOW';
    }
    if (researchData.crowd_level !== undefined || researchData.crowdLevel !== undefined) {
      const c = researchData.crowd_level ?? researchData.crowdLevel;
      env.crowdLevel = typeof c === 'number' ? Math.min(1, Math.max(0, c)) : undefined;
    }
    return env;
  }
}
