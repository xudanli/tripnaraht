// src/trips/decision/services/weather-decision-evidence.service.ts
/**
 * @legacy-frozen — 新增分支决策请走 overlay；本服务保留证据管道与 observability。
 *
 * 天气决策证据服务
 *
 * 强制规则：
 * ❌ 没有 WeatherEvidence 的 segment 不允许 finalize
 * ❌ 风速 > 15 m/s → 禁止侧风路段
 * ❌ 能去 ≠ 应该去
 *
 * P0：观测数据仅来自 DataSourceRouter → ExtendedWeatherData（已移除 mock）。
 * P1：阈值比较收敛到 hazard/derive-travel-hazards（TravelHazard + ExecutionState）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { assertRealityWorldReadAllowed } from '../../reality-kernel/reality-policy-engine';
import {
  RealityExecutionBlockedError,
  requiresPlanningHeuristicWorldModelOnly,
} from '../../reality-kernel/reality-execution-gate';
import { RealityBypassBlockedError } from '../../reality-kernel/reality-read-audit';
import { getBoundDecisionContext } from '../../reality-kernel/reality-context.storage';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
import { ExtendedWeatherData, WeatherQuery } from '../../../data-contracts/interfaces/weather.interface';
import {
  WeatherDecisionEvidence,
  WeatherEvidencePipelineResult,
  WeatherDecisionRules,
  WeatherEvidenceLocationContext,
} from '../interfaces/weather-decision-evidence.interface';
import { TripPlan, PlanDay } from '../plan-model';
import {
  deriveTravelHazards,
  type HazardDerivationResult,
  type NormalizedObservationInput,
} from '../hazard/derive-travel-hazards';
/** 各适配器能见度单位不一致，此处统一为 km 后再做规则比较 */
interface NormalizedWeatherInput {
  windSpeed: number;
  windGust?: number;
  windDirection: number;
  precipitationMm: number;
  visibilityKm?: number;
  temperatureDrop: number;
  source: string;
}

@Injectable()
export class WeatherDecisionEvidenceService {
  private readonly logger = new Logger(WeatherDecisionEvidenceService.name);

  constructor(private readonly dataSourceRouter: DataSourceRouterService) {}

  /**
   * 生成天气决策证据管道
   */
  async generateEvidencePipeline(
    plan: TripPlan,
    rules?: WeatherDecisionRules,
    context?: WeatherEvidenceLocationContext,
  ): Promise<WeatherEvidencePipelineResult> {
    const segmentEvidences: WeatherDecisionEvidence[] = [];

    for (const day of plan.days) {
      const evidence = await this.generateDayEvidence(day, rules, context);
      segmentEvidences.push(evidence);
    }

    const hasHardViolation = segmentEvidences.some(e => e.violation === 'HARD');
    const hasSoftViolation = segmentEvidences.some(e => e.violation === 'SOFT');

    const explainableFailure = this.generateExplainableFailure(
      segmentEvidences,
      hasHardViolation,
      hasSoftViolation,
    );

    return {
      segmentEvidences,
      hasHardViolation,
      hasSoftViolation,
      canProceed: !hasHardViolation,
      explainableFailure,
    };
  }

  private async generateDayEvidence(
    day: PlanDay,
    rules?: WeatherDecisionRules,
    context?: WeatherEvidenceLocationContext,
  ): Promise<WeatherDecisionEvidence> {
    const point = this.resolveRepresentativePoint(day, context);
    if (!point) {
      return this.buildMissingLocationEvidence(day);
    }

    try {
      if (requiresPlanningHeuristicWorldModelOnly(getBoundDecisionContext())) {
        return this.buildExecutionGateDegradedWeatherEvidence(day, point);
      }
      const query: WeatherQuery = {
        lat: point.lat,
        lng: point.lng,
        date: day.date,
        includeWindDetails: true,
      };
      assertRealityWorldReadAllowed(
        this.logger,
        'WeatherDecisionEvidenceService.generateDayEvidence',
        'live weather read',
      );
      const raw = await this.dataSourceRouter.getWeatherEvidence(query);
      if (!raw.freshness.strongJudgmentAllowed) {
        this.logger.warn(
          `天气证据已过期或 stale day=${day.date} status=${raw.freshness.status}`,
        );
      }
      const weather = raw.value as ExtendedWeatherData;
      const normalized = this.normalizeWeather(weather);

      const obs: NormalizedObservationInput = {
        windSpeedMs: normalized.windSpeed,
        windGustMs: normalized.windGust,
        windDirectionDeg: normalized.windDirection,
        precipitationMm: normalized.precipitationMm,
        visibilityKm: normalized.visibilityKm,
      };

      const derived = deriveTravelHazards(obs, rules, context?.vehicleProfile);

      const effectiveWindMs = Math.max(
        normalized.windSpeed,
        normalized.windGust ?? 0,
      );

      let violation = derived.violation;
      let executionState = derived.executionState;
      let explanation =
        derived.explanationParts.length > 0
          ? derived.explanationParts.join('；')
          : '天气条件在安全范围内';

      if (!raw.freshness.strongJudgmentAllowed) {
        if (violation === 'HARD') {
          violation = 'SOFT';
          executionState = 'DEGRADED';
        }
        explanation = `${explanation}；观测数据已过期或超出强判断时效（${raw.freshness.status}），结论仅供参考`;
      }

      return {
        segmentId: `day_${day.day}_${day.date}`,
        date: day.date,
        windSpeed: normalized.windSpeed,
        windDirection: normalized.windDirection,
        precipitation: normalized.precipitationMm,
        visibility: normalized.visibilityKm,
        temperatureDrop: normalized.temperatureDrop,
        crosswindRisk: derived.crosswindRisk,
        hazards: derived.hazards,
        executionState,
        executionQuality: derived.executionQuality,
        violation,
        explanation,
        suggestedAction: this.suggestActionFromDerivation({
          ...derived,
          violation,
          executionState,
        }),
        metadata: {
          weatherWindowAvailable: effectiveWindMs < (rules?.maxWindSpeed ?? 15),
          forecastReliability: raw.freshness.strongJudgmentAllowed ? 'MEDIUM' : 'LOW',
          historicalRiskLevel: 'MEDIUM',
          weatherSource: normalized.source,
          evidenceObservedAt: raw.observedAt,
          evidenceValidUntil: raw.validUntil,
          evidenceConfidence: raw.confidence,
          evidenceFreshnessStatus: raw.freshness.status,
          strongJudgmentAllowed: raw.freshness.strongJudgmentAllowed,
          resolvedLat: point.lat,
          resolvedLng: point.lng,
          windGustMs: normalized.windGust,
          vehicleClass: context?.vehicleProfile?.vehicleClass,
        },
      };
    } catch (err: any) {
      if (
        err instanceof RealityBypassBlockedError ||
        err instanceof RealityExecutionBlockedError
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`天气证据获取失败 day=${day.date}: ${msg}`);
      return {
        segmentId: `day_${day.day}_${day.date}`,
        date: day.date,
        windSpeed: 0,
        windDirection: 0,
        precipitation: 0,
        visibility: undefined,
        temperatureDrop: 0,
        crosswindRisk: 'NONE',
        executionState: 'BLOCKED',
        violation: 'HARD',
        explanation: `无法获取真实天气数据：${msg}`,
        suggestedAction: 'DELAY',
        metadata: {
          weatherWindowAvailable: false,
          forecastReliability: 'LOW',
          historicalRiskLevel: 'MEDIUM',
          fetchError: msg,
          resolvedLat: point.lat,
          resolvedLng: point.lng,
        },
      };
    }
  }

  private suggestActionFromDerivation(d: HazardDerivationResult): 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED' {
    if (d.executionState === 'BLOCKED' || d.violation === 'HARD') {
      return 'CANCEL';
    }
    if (d.executionState === 'DEGRADED' || d.executionState === 'HIGH_RISK' || d.violation === 'SOFT') {
      return 'DELAY';
    }
    return 'PROCEED';
  }

  /** ExecutionGate — PLANNING_HEURISTIC_ONLY: no live weather API; conservative synthetic segment. */
  private buildExecutionGateDegradedWeatherEvidence(
    day: PlanDay,
    point: { lat: number; lng: number },
  ): WeatherDecisionEvidence {
    return {
      segmentId: `day_${day.day}_${day.date}`,
      date: day.date,
      windSpeed: 0,
      windDirection: 0,
      precipitation: 0,
      visibility: undefined,
      temperatureDrop: 0,
      crosswindRisk: 'NONE',
      executionState: 'DEGRADED',
      violation: 'SOFT',
      hazards: [],
      explanation:
        'Execution Gate: degraded planning tick — live weather fetch skipped (PLANNING_HEURISTIC_ONLY).',
      suggestedAction: 'DELAY',
      metadata: {
        weatherWindowAvailable: false,
        forecastReliability: 'LOW',
        historicalRiskLevel: 'HIGH',
        weatherSource: 'execution_gate_heuristic_only',
        resolvedLat: point.lat,
        resolvedLng: point.lng,
      },
    };
  }

  private buildMissingLocationEvidence(day: PlanDay): WeatherDecisionEvidence {
    return {
      segmentId: `day_${day.day}_${day.date}`,
      date: day.date,
      windSpeed: 0,
      windDirection: 0,
      precipitation: 0,
      visibility: undefined,
      temperatureDrop: 0,
      crosswindRisk: 'NONE',
      executionState: 'BLOCKED',
      violation: 'HARD',
      explanation:
        '无法解析当日代表性坐标，且未提供 fallbackLat/fallbackLng，不能绑定真实天气观测。',
      suggestedAction: 'CANCEL',
      metadata: {
        weatherWindowAvailable: false,
        forecastReliability: 'LOW',
        fetchError: 'MISSING_LOCATION_ANCHOR',
      },
    };
  }

  /**
   * 从当日 slot 取坐标均值；若无则使用 context fallback。
   */
  private resolveRepresentativePoint(
    day: PlanDay,
    context?: WeatherEvidenceLocationContext,
  ): { lat: number; lng: number } | null {
    const coords = day.timeSlots
      .map(s => s.coordinates)
      .filter((c): c is { lat: number; lng: number } =>
        !!c && typeof c.lat === 'number' && typeof c.lng === 'number' && !Number.isNaN(c.lat + c.lng),
      );
    if (coords.length > 0) {
      const lat = coords.reduce((a, c) => a + c.lat, 0) / coords.length;
      const lng = coords.reduce((a, c) => a + c.lng, 0) / coords.length;
      return { lat, lng };
    }
    if (
      context?.fallbackLat !== undefined &&
      context?.fallbackLng !== undefined &&
      !Number.isNaN(context.fallbackLat + context.fallbackLng)
    ) {
      return { lat: context.fallbackLat, lng: context.fallbackLng };
    }
    return null;
  }

  private normalizeWeather(weather: ExtendedWeatherData): NormalizedWeatherInput {
    const precipRaw = weather.metadata?.precipitation;
    const precipitationMm = typeof precipRaw === 'number' && !Number.isNaN(precipRaw) ? precipRaw : 0;

    return {
      windSpeed: weather.windSpeed ?? 0,
      windGust: weather.windGust,
      windDirection: weather.windDirection ?? 0,
      precipitationMm,
      visibilityKm: this.visibilityToKm(weather.visibility, weather.source),
      temperatureDrop: 0,
      source: weather.source,
    };
  }

  /**
   * 冰岛官方源 Vedur.is 能见度按米进入标准契约；DefaultWeatherAdapter 将 OpenWeather 转为 km 存入 visibility。
   */
  private visibilityToKm(visibility: number | undefined, source: string): number | undefined {
    if (visibility === undefined || Number.isNaN(visibility)) {
      return undefined;
    }
    const s = source.toLowerCase();
    if (s.includes('vedur.is') || s.includes('apis.is') || s.includes('iceland')) {
      return visibility / 1000;
    }
    if (s.includes('openweather')) {
      return visibility;
    }
    return visibility > 200 ? visibility / 1000 : visibility;
  }

  private generateExplainableFailure(
    evidences: WeatherDecisionEvidence[],
    hasHardViolation: boolean,
    hasSoftViolation: boolean,
  ): WeatherEvidencePipelineResult['explainableFailure'] {
    if (!hasHardViolation && !hasSoftViolation) {
      return undefined;
    }

    const parseDayOrdinal = (segmentId: string): number => {
      const m = /^day_(\d+)_/.exec(segmentId);
      return m ? parseInt(m[1], 10) : 0;
    };

    if (hasHardViolation) {
      const affectedDays = evidences
        .filter(e => e.violation === 'HARD')
        .map(e => parseDayOrdinal(e.segmentId))
        .filter(d => d > 0);
      return {
        reason: '天气条件不符合安全要求',
        affectedDays,
        userImpact: '计划无法执行，需要调整日期或路线',
      };
    }

    if (hasSoftViolation) {
      const affectedDays = evidences
        .filter(e => e.violation === 'SOFT')
        .map(e => parseDayOrdinal(e.segmentId))
        .filter(d => d > 0);
      return {
        reason: '天气条件存在风险',
        affectedDays,
        userImpact: '建议延迟或调整计划',
      };
    }

    return undefined;
  }

  /**
   * 验证计划是否有天气证据
   */
  validatePlanHasWeatherEvidence(
    plan: TripPlan,
    evidenceResult: WeatherEvidencePipelineResult,
  ): { valid: boolean; reason?: string } {
    if (evidenceResult.segmentEvidences.length === 0) {
      return {
        valid: false,
        reason: '计划没有天气决策证据',
      };
    }

    if (evidenceResult.hasHardViolation) {
      return {
        valid: false,
        reason: '计划包含天气硬违规，不允许 finalize',
      };
    }

    return { valid: true };
  }
}
