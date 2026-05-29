/**
 * GateEvalExecutorService
 *
 * 实现 IGateEvalExecutor，执行 GATE_EVAL 阶段
 * 准备度检查 + 失败风险预测 + GatekeeperAgent
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState, ConstraintReport } from '../../decision/kernel/decision-state.types';
import type {
  IGateEvalExecutor,
  PhaseExecutorContext,
  GateResultLike,
  OrchestratorAlternativesLike,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';
import { ClaudeGatekeeperAgentService } from '../services/sub-agents/gatekeeper-agent.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import type { TripPlanRequest, OrchestratorState } from '../interfaces/trip-plan.interface';
import { HardTruthRuleResolverService } from '../services/hard-truth-rule-resolver.service';
import { driveSafetyWindThresholdMps } from '../../trips/ontology/environment/weather.schema';
import { evaluateConflictMatrix, type ConflictMatrixRule } from '../../trips/decision/shared/conflict-matrix.util';
import { PrismaService } from '../../prisma/prisma.service';
import { getWeatherForTime } from '../../trips/ontology/environment/environment-domain.util';

@Injectable()
export class GateEvalExecutorService implements IGateEvalExecutor {
  private readonly logger = new Logger(GateEvalExecutorService.name);

  constructor(
    private readonly tripContextExtractor: TripContextExtractorService,
    @Optional() private readonly readinessService?: ReadinessService,
    @Optional() private readonly userDecisionService?: UserDecisionService,
    @Optional() private readonly gatekeeperAgent?: ClaudeGatekeeperAgentService,
    @Optional() private readonly hardTruthRules?: HardTruthRuleResolverService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ constraints: ConstraintReport; gateResult: GateResultLike; alternatives?: OrchestratorAlternativesLike }> {
    this.logger.debug(`[GateEvalExecutor] 执行 GATE_EVAL 阶段 requestId=${ctx.requestId}`);
    await this.hardTruthRules?.refreshFromDbIfStale();
    const hardTruth = this.hardTruthRules?.getSnapshot() ?? { gateFroadBlock2wd: true };

    const tripRequest = ctx.tripPlanRequest;
    const researchData = (ctx.researchData ?? {}) as Record<string, any>;

    let readinessBlockers: any[] = [];
    let readinessMust: any[] = [];
    let rulesNeedingDecision: any[] = [];

    // 1. 准备度检查
    if (this.readinessService && tripRequest) {
      try {
        const destination =
          typeof tripRequest.destination === 'string'
            ? tripRequest.destination
            : `${(tripRequest.destination as any).lat},${(tripRequest.destination as any).lng}`;
        const tripContext = this.tripContextExtractor.extract(tripRequest);
        const geoLat = typeof tripRequest.destination === 'object' ? (tripRequest.destination as any).lat : undefined;
        const geoLng = typeof tripRequest.destination === 'object' ? (tripRequest.destination as any).lng : undefined;

        const readinessCheckResult = await this.readinessService.checkFromDestination(
          destination,
          tripContext,
          { enhanceWithGeo: !!(geoLat && geoLng), geoLat, geoLng, lang: 'zh' },
        );

        readinessBlockers = readinessCheckResult.findings.flatMap((f: any) => f.blockers || []);
        readinessMust = readinessCheckResult.findings.flatMap((f: any) => f.must || []);

        if (this.userDecisionService) {
          rulesNeedingDecision = [...readinessBlockers, ...readinessMust].filter(
            (item: any) => item.userDecision?.questions?.length > 0,
          );
        }
      } catch (e: any) {
        this.logger.warn(`[GateEvalExecutor] 准备度检查失败: ${e?.message}`);
      }
    }

    // 2. 失败风险预测检查
    if (researchData.failure_risk_prediction?.predictions && ctx.routeDirectionId) {
      const highRiskDays = researchData.failure_risk_prediction.predictions.filter(
        (p: any) => p.riskLevel === 'HIGH',
      );
      if (highRiskDays.length > 0) {
        readinessBlockers = readinessBlockers || [];
        readinessBlockers.push({
          type: 'FAILURE_RISK',
          severity: 'HARD',
          message: {
            zh: `预测到第${highRiskDays.map((d: any) => d.day).join(', ')}天存在高风险，建议调整行程日期`,
            en: `High risk predicted for days ${highRiskDays.map((d: any) => d.day).join(', ')}, consider adjusting dates`,
          },
          evidence: [{ sourceId: `failure_risk_prediction_${Date.now()}`, source: 'FailureRiskPredictionService' }],
        });
      }
    }

    // 3. 有 blocker 且无需用户决策 -> BLOCK
    if (readinessBlockers.length > 0 && rulesNeedingDecision.length === 0) {
      const gateResult: GateResultLike = {
        gate_result: 'BLOCK',
        violations: readinessBlockers.map((item: any) => ({
          type: 'SAFETY',
          severity: 'HARD' as const,
          detail: typeof item.message === 'string' ? item.message : item.message?.zh || item.message?.en || '',
        })),
        required_adjustments: [],
        confidence: 0.9,
      };
      const hasFailureRisk = readinessBlockers.some((b: any) => b?.type === 'FAILURE_RISK');
      return {
        constraints: { feasible: false, violations: gateResult.violations, gateOutcome: 'BLOCK' },
        gateResult,
        alternatives: this.alternativesForBlockedGate(gateResult, hasFailureRisk ? 'failure_risk' : 'readiness'),
      };
    }

    // 4. 需要用户决策 -> NEED_USER_CONFIRM
    if (rulesNeedingDecision.length > 0) {
      const gateResult: GateResultLike = {
        gate_result: 'NEED_USER_CONFIRM',
        violations: [],
        required_adjustments: [],
        confidence: 0.8,
      };
      return {
        constraints: { feasible: false, violations: [], gateOutcome: 'NEED_USER_CONFIRM' },
        gateResult,
      };
    }

    // 5. Gatekeeper Agent 评估
    if (this.gatekeeperAgent && tripRequest) {
      const req = this.toTripPlanRequest(tripRequest, ctx.requestId);
      const minimalState: Partial<OrchestratorState> = {
        request_id: ctx.requestId,
        trip_plan_request: req,
        research_data: researchData,
      };
      let gateResult = await this.gatekeeperAgent.evaluateGate(req, researchData, minimalState as OrchestratorState);

      // 合并 readinessMust
      if (readinessMust.length > 0) {
        gateResult = {
          ...gateResult,
          required_adjustments: [
            ...gateResult.required_adjustments,
            ...readinessMust.map((item: any) => ({
              action: 'REPLACE_SEGMENT' as const,
              why: typeof item.message === 'string' ? item.message : item.message?.zh || item.message?.en || '',
              alternatives: [] as any[],
            })),
          ],
        };
        if (gateResult.gate_result === 'ALLOW' && readinessMust.length > 0) {
          gateResult = { ...gateResult, gate_result: 'ADJUST_REQUIRED' as const };
        }
      }

      const constraints: ConstraintReport = {
        feasible: gateResult.gate_result === 'ALLOW',
        violations: (gateResult.violations || []).map((v) => ({ type: v.type, severity: v.severity, detail: v.detail })),
        feasibleActions: gateResult.required_adjustments?.map((a) => a.action),
        gateOutcome: gateResult.gate_result,
      };
      const gateResultLike: GateResultLike = {
        gate_result: gateResult.gate_result,
        violations: gateResult.violations || [],
        required_adjustments: gateResult.required_adjustments || [],
        confidence: gateResult.confidence ?? 0.8,
      };
      return {
        constraints,
        gateResult: gateResultLike,
        alternatives:
          gateResultLike.gate_result === 'BLOCK'
            ? this.alternativesForBlockedGate(gateResultLike, 'gatekeeper')
            : undefined,
      };
    }

    // 6. 最小硬规则（无 gatekeeperAgent 时仍可执行）：准入/空间类原子约束
    const extraViolations = await this.evaluateAdmissionAndSpatialAtoms(tripRequest, researchData, hardTruth);

    // 降级：默认 ALLOW（若 extraViolations 存在则 ADJUST_REQUIRED/BLOCK）
    const gateResult: GateResultLike = {
      gate_result:
        extraViolations.some((v) => v.severity === 'HARD')
          ? 'BLOCK'
          : (readinessMust.length > 0 || extraViolations.length > 0)
            ? 'ADJUST_REQUIRED'
            : 'ALLOW',
      violations: extraViolations,
      required_adjustments: readinessMust.map((item: any) => ({
        action: 'REPLACE_SEGMENT',
        why: typeof item.message === 'string' ? item.message : item.message?.zh || item.message?.en || '',
      })),
      confidence: 0.8,
    };
    return {
      constraints: {
        feasible: gateResult.gate_result === 'ALLOW',
        violations: gateResult.violations,
        feasibleActions: [],
        gateOutcome: gateResult.gate_result,
      },
      gateResult,
    };
  }

  private async evaluateAdmissionAndSpatialAtoms(
    tripRequest: PhaseExecutorContext['tripPlanRequest'] | undefined,
    researchData: Record<string, any>,
    hardTruth: { gateFroadBlock2wd: boolean },
  ): Promise<GateResultLike['violations']> {
    if (!tripRequest) return [];
    const out: GateResultLike['violations'] = [];

    // --- 准入类：F-road / 4x4 vs vehicle_type ---
    const vehicleRequiredRaw =
      researchData?.routeCorridorWorld?.constraints?.vehicleRequired ??
      researchData?.route_corridor_world?.constraints?.vehicleRequired ??
      researchData?.world?.routeDirection?.metadata?.vehicleRequired ??
      researchData?.world?.routeDirection?.metadata?.vehicleRequired;
    const vehicleRequired = typeof vehicleRequiredRaw === 'string' ? vehicleRequiredRaw.toLowerCase() : '';
    const need4x4 = /4x4|4wd|四驱/.test(vehicleRequired);

    const vehicleType = (tripRequest as any)?.constraints?.vehicle_type as '2WD' | '4WD' | undefined;
    const is2wd = vehicleType === '2WD';

    if (hardTruth.gateFroadBlock2wd && need4x4 && is2wd) {
      out.push({
        type: 'REACHABILITY',
        severity: 'HARD',
        detail: `Route requires 4x4/4WD (${String(vehicleRequiredRaw)}), but vehicle_type is 2WD.`,
      });
    } else if (hardTruth.gateFroadBlock2wd && need4x4 && vehicleType === undefined) {
      out.push({
        type: 'REACHABILITY',
        severity: 'SOFT',
        detail: `Route may require 4x4/4WD (${String(vehicleRequiredRaw)}); vehicle_type is unspecified — confirm rental drivetrain before committing.`,
      });
    }

    // --- 空间类：must_include_poi_ids vs days（近似容量判断） ---
    const must = Array.isArray((tripRequest as any)?.must_include_poi_ids)
      ? ((tripRequest as any).must_include_poi_ids as string[])
      : [];
    const days = typeof (tripRequest as any)?.days === 'number' ? (tripRequest as any).days : undefined;
    if (must.length > 0 && typeof days === 'number' && Number.isFinite(days) && must.length > Math.max(1, Math.floor(days) + 1)) {
      out.push({
        type: 'SCOPE',
        severity: 'SOFT',
        detail: `must_include_poi_ids(${must.length}) exceeds approximate capacity for days=${days}. Consider increasing days or removing must-includes.`,
      });
    }

    // --- Environment: wind hard gate (admin overrides / warm evidence) ---
    // Prefer admin overrides: routeDirection.metadata.environment_overrides_v1 (injected into world.physical.prefetched_evidence).
    // This ensures preview/commit signatures and gate decisions remain auditable.
    try {
      const prefetched: any[] =
        (researchData?.world?.physical?.prefetched_evidence as any[]) ??
        (researchData?.world_build_context?.world?.physical?.prefetched_evidence as any[]) ??
        (researchData?.worldModel?.physical?.prefetched_evidence as any[]) ??
        [];
      const list = Array.isArray(prefetched) ? prefetched : [];
      const envOverride = list.find((x) => x && typeof x === 'object' && (x as any).kind === 'environment_overrides_v1');
      const w = envOverride?.overrides?.weather;
      const wind =
        typeof w?.wind_mps === 'number'
          ? Number(w.wind_mps)
          : typeof w?.windSpeedMps === 'number'
            ? Number(w.windSpeedMps)
            : typeof w?.wind_speed_mps === 'number'
              ? Number(w.wind_speed_mps)
              : null;
      if (wind != null && Number.isFinite(wind)) {
        const explicitThr =
          typeof w?.threshold_wind_mps === 'number'
            ? Number(w.threshold_wind_mps)
            : typeof w?.wind_threshold_mps === 'number'
              ? Number(w.wind_threshold_mps)
              : null;
        const windVehicleHint =
          vehicleType === '4WD' ? 'SUV' : vehicleType === '2WD' ? '2WD' : 'SUV';
        const thr =
          explicitThr != null && Number.isFinite(explicitThr)
            ? explicitThr
            : driveSafetyWindThresholdMps(windVehicleHint);
        if (wind > thr) {
          out.push({
            type: 'SAFETY',
            severity: 'HARD',
            detail: `Wind unsafe for driving (wind=${wind}m/s > threshold=${thr}m/s).`,
          });
        }
      }
    } catch {
      // best-effort only
    }

    // --- Conflict Matrix (v1.1): multi-factor physical conflicts ---
    try {
      const prefetched: any[] =
        (researchData?.world?.physical?.prefetched_evidence as any[]) ??
        (researchData?.world_build_context?.world?.physical?.prefetched_evidence as any[]) ??
        (researchData?.worldModel?.physical?.prefetched_evidence as any[]) ??
        [];
      const roadStates: any[] =
        (researchData?.world?.physical?.roadStates as any[]) ??
        (researchData?.world_build_context?.world?.physical?.roadStates as any[]) ??
        (researchData?.worldModel?.physical?.roadStates as any[]) ??
        [];
      const envOverride = (Array.isArray(prefetched) ? prefetched : []).find(
        (x) => x && typeof x === 'object' && (x as any).kind === 'environment_overrides_v1',
      );
      const weather = this.pickRelevantForecastWeather(envOverride?.overrides?.weather, tripRequest);
      const visibilityMeters =
        typeof weather?.visibility_m === 'number'
          ? Number(weather.visibility_m)
          : typeof weather?.visibilityMeters === 'number'
            ? Number(weather.visibilityMeters)
            : typeof weather?.visibility_meters === 'number'
              ? Number(weather.visibility_meters)
              : null;
      const precipitationMm =
        typeof weather?.precipitation_mm === 'number'
          ? Number(weather.precipitation_mm)
          : typeof weather?.precipitationMm === 'number'
            ? Number(weather.precipitationMm)
            : null;
      const confidenceScore =
        typeof weather?.confidenceScore === 'number'
          ? Number(weather.confidenceScore)
          : typeof weather?.confidence_score === 'number'
            ? Number(weather.confidence_score)
            : null;
      const windKph =
        typeof weather?.windSpeedKph === 'number'
          ? Number(weather.windSpeedKph)
          : typeof weather?.wind_speed_kph === 'number'
            ? Number(weather.wind_speed_kph)
            : typeof weather?.wind_mps === 'number'
              ? Number(weather.wind_mps) * 3.6
              : null;

      const snowDepthCm =
        typeof weather?.snowDepthCm === 'number'
          ? Number(weather.snowDepthCm)
          : typeof weather?.snow_depth_cm === 'number'
            ? Number(weather.snow_depth_cm)
            : typeof weather?.snow_depth_cm_value === 'number'
              ? Number(weather.snow_depth_cm_value)
              : null;

      const hasFRoad = (Array.isArray(roadStates) ? roadStates : []).some((r) => {
        const md = r?.metadata ?? {};
        const t = String(md?.segmentType ?? '').toUpperCase();
        const s = String(md?.surfaceType ?? '').toLowerCase();
        return t === 'F_ROAD' || s === 'f-road';
      });
      const vehicleClass =
        vehicleType === '2WD' ? 'SMALL_CAR' : vehicleType === '4WD' ? 'SUV_4WD' : 'UNKNOWN';
      const facts: Record<string, unknown> = {
        segment: { type: hasFRoad ? 'F_ROAD' : 'OTHER' },
        weather: {
          visibilityMeters,
          precipitationMm,
          confidenceScore,
          windSpeedKph: windKph,
          snowDepthCm,
        },
        vehicle: { type: vehicleClass },
      };
      const matrixRules = await this.loadConflictMatrixRules();
      const hits = evaluateConflictMatrix({ rules: matrixRules, facts });
      for (const hit of hits) {
        const severity: 'HARD' | 'SOFT' = hit.effect === 'HARD_BLOCK' ? 'HARD' : 'SOFT';
        out.push({
          type: 'SAFETY',
          severity,
          detail: `ConflictMatrix hit: ${hit.ruleId} (${hit.effect})`,
        });
      }
    } catch {
      // best-effort only
    }

    return out;
  }

  private async loadConflictMatrixRules(): Promise<ConflictMatrixRule[]> {
    const fallback: ConflictMatrixRule[] = [
      {
        id: 'froad_low_visibility_hard_block_v1',
        conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
        effect: 'HARD_BLOCK',
        priority: 100,
      },
      {
        id: 'froad_snow_depth_hard_block_v1',
        conditions: ['segment.type = F_ROAD', 'weather.snowDepthCm > 10'],
        effect: 'HARD_BLOCK',
        priority: 92,
      },
      {
        id: 'wind_small_car_hard_block_v1',
        conditions: ['weather.windSpeedKph > 50', 'vehicle.type = SMALL_CAR'],
        effect: 'HARD_BLOCK',
        priority: 95,
      },
      {
        id: 'heavy_rain_high_confidence_reroute_v1',
        conditions: ['weather.precipitationMm > 10', 'weather.confidenceScore > 0.85'],
        effect: 'RE_ROUTE',
        priority: 80,
      },
    ];
    if (!this.prisma) return fallback;
    try {
      const rows = await (this.prisma as any).physicalDomainConstraintConfig.findMany({
        where: { enabled: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 200,
      });
      const out: ConflictMatrixRule[] = [];
      for (const row of rows) {
        const p = row.params as any;
        if (!p || typeof p !== 'object') continue;
        const kind = String(p.kind ?? p.type ?? '').toUpperCase();
        if (kind !== 'CONFLICT_MATRIX') continue;
        const effect = String(p.effect ?? '').toUpperCase();
        if (!['HARD_BLOCK', 'WARNING', 'RE_ROUTE', 'SPEED_FACTOR_DOWN'].includes(effect)) continue;
        const conditions = Array.isArray(p.conditions) ? p.conditions.map((x: any) => String(x)).filter(Boolean) : [];
        if (conditions.length === 0) continue;
        const priority = Number.isFinite(Number(p.priority)) ? Number(p.priority) : 0;
        out.push({
          id: row.ruleId,
          conditions,
          effect: effect as ConflictMatrixRule['effect'],
          priority,
        });
      }
      return out.length > 0 ? out : fallback;
    } catch {
      return fallback;
    }
  }

  private pickRelevantForecastWeather(
    weatherRaw: any,
    tripRequest: PhaseExecutorContext['tripPlanRequest'] | undefined,
  ): any {
    if (!weatherRaw || typeof weatherRaw !== 'object') return weatherRaw;
    const series = Array.isArray(weatherRaw?.forecastSeries)
      ? weatherRaw.forecastSeries
      : Array.isArray(weatherRaw?.forecast_series)
        ? weatherRaw.forecast_series
        : [];
    if (series.length === 0) return weatherRaw;
    const timeISO =
      (tripRequest as any)?.date_range?.start_date ??
      (tripRequest as any)?.start_date ??
      new Date().toISOString();

    const normalizedSeries = series
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

    const selected = getWeatherForTime({
      weatherForecasts: normalizedSeries as any,
      timeISO: String(timeISO),
    }) as any;
    return selected ?? weatherRaw;
  }

  /**
   * BLOCK 时带出与门控原因对齐的可读替代（TD-03 / claude_exec），供 Kernel 写入 DSO `tripState.orchestratorAlternatives`
   */
  private alternativesForBlockedGate(
    gateResult: GateResultLike,
    source: 'readiness' | 'failure_risk' | 'gatekeeper',
  ): OrchestratorAlternativesLike {
    const detail =
      gateResult.violations
        .map((v) => v.detail)
        .filter((d) => typeof d === 'string' && d.trim().length > 0)
        .slice(0, 3)
        .join('；') || '当前门控不满足可执行行程条件';
    const nameBySource: Record<typeof source, string> = {
      readiness: '满足准备度要求后重新规划',
      failure_risk: '调整高风险日或路线后重试',
      gatekeeper: '按硬门控建议修改需求后重试',
    };
    return {
      alternative_pois: [
        {
          poi_id: `gate-block-${source}`,
          name: nameBySource[source],
          reason: detail.slice(0, 280),
          evidence_status: 'UNVERIFIED',
        },
      ],
      alternative_routes: [],
    };
  }

  private toTripPlanRequest(
    req: PhaseExecutorContext['tripPlanRequest'],
    requestId: string,
  ): TripPlanRequest {
    return {
      request_id: requestId,
      origin: (req?.origin ?? '') as TripPlanRequest['origin'],
      destination: (req?.destination ?? '') as TripPlanRequest['destination'],
      date_range: req?.date_range,
      start_date: req?.start_date,
      days: req?.days,
      mode: req?.mode as TripPlanRequest['mode'],
      party: req?.party as TripPlanRequest['party'],
      party_profile: req?.party_profile as TripPlanRequest['party_profile'],
    };
  }
}
