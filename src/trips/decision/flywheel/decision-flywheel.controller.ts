import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import type { Response } from 'express';
import type { BeliefStateSample } from '../../../decision/kernel/decision-state.types';
import type { ScenarioEdgeEvalInput } from '../../../decision/kernel/parallel-decision-kernel';
import { ParallelDecisionKernelService } from '../../../decision/kernel/parallel-decision-kernel.service';
import {
  buildPredictedEdgeFingerprints,
  deriveCalibrationSignals,
  type CalibrationSignal,
  type ObservedEdgeOutcome,
  type RiskFeedbackEvent,
} from '../../../decision/kernel/flywheel-risk-feedback';
import { DecisionAuditService } from './decision-audit.service';
import { DecisionAmbiguityResolver } from '../../../decision/kernel/ambiguity-resolver';
import type { VehicleClass } from './context-utils';
import { buildContextKey } from './context-utils';
import { InterventionEngine, type InterventionDecision, type RealtimeState } from '../../../decision/actuator/intervention-engine';
import type { AmbiguityReport } from '../../../decision/kernel/ambiguity-resolver';
import type { FailureDriversReport, StochasticAggregate } from '../../../decision/kernel/parallel-decision-kernel';
import { buildShadowDecisionTrace, toShadowInterventionEnvelope } from '../../../decision/kernel/shadow-trace';

@ApiTags('Decision Flywheel')
@Controller('decision/flywheel')
export class DecisionFlywheelController {
  private readonly ambiguity = new DecisionAmbiguityResolver();

  constructor(
    private readonly parallelKernel: ParallelDecisionKernelService,
    private readonly audit: DecisionAuditService,
    private readonly intervention: InterventionEngine,
  ) {}

  private async maybeLogShadowDecision(params: {
    shadowMode: boolean;
    userId?: string;
    tripId?: string;
    context?: { userId?: string; region?: string; countryCode?: string; month?: number; vehicleClass?: VehicleClass };
    contextKey?: string;
    recentSignals: Array<CalibrationSignal & { at?: string; userId?: string; contextKey?: string }>;
    ambiguity?: AmbiguityReport;
    failureDrivers: FailureDriversReport;
    intervention: InterventionDecision;
    aggregate: StochasticAggregate;
    alpha: number;
    beta: number;
    realtimeState?: RealtimeState;
  }): Promise<void> {
    if (!params.shadowMode || params.intervention.action === 'MAINTAIN_GUIDANCE' || !params.userId) return;

    const ctxKey = (params.contextKey ?? 'UNKNOWN').trim() || 'UNKNOWN';
    const trace = buildShadowDecisionTrace({
      contextKey: ctxKey,
      recentSignals: params.recentSignals,
      ambiguity: params.ambiguity,
      failureDrivers: params.failureDrivers,
      intervention: toShadowInterventionEnvelope(params.intervention as any),
      aggregate: params.aggregate,
      alpha: params.alpha,
      beta: params.beta,
      realtimeState: params.realtimeState
        ? {
            at: params.realtimeState.at,
            lat: params.realtimeState.lat,
            lng: params.realtimeState.lng,
            speedMs: params.realtimeState.speedMs,
            delayMinutes: params.realtimeState.delayMinutes,
          }
        : undefined,
    });

    await this.audit.logShadowDecision({
      userId: params.userId,
      tripId: params.tripId,
      context: {
        userId: params.userId,
        region: params.context?.region,
        countryCode: params.context?.countryCode,
        month: params.context?.month,
        vehicleClass: params.context?.vehicleClass,
      },
      payload: {
        payloadVersion: 2,
        trace,
        intervention: toShadowInterventionEnvelope(params.intervention as any),
      },
    });
  }

  /**
   * A 阶段：实时预览 / 规划（快速）。
   * 返回精简样本统计量 + E/CVaR + 前 M 个失效驱动因素摘要。
   */
  @Public()
  @Post('predict')
  async predict(
    @Body()
    body: {
      samples: BeliefStateSample[];
      edges: ScenarioEdgeEvalInput[];
      envDefaults: { weatherRisk01: number; windSpeedMs?: number };
      recentSignals?: CalibrationSignal[];
      context?: { userId?: string; region?: string; countryCode?: string; month?: number; vehicleClass?: VehicleClass };
      alpha?: number;
      beta?: number;
      targetReducedN?: number;
      topMEdges?: number;
      shadowMode?: boolean;
      realtimeState?: RealtimeState;
      tripId?: string;
    },
  ) {
    const alpha = body.alpha ?? 0.95;
    const beta = body.beta ?? 0.5;
    const shadowMode = !!body.shadowMode;
    const targetReducedN = body.targetReducedN ?? Math.min(100, body.samples?.length ?? 0);

    const reduced = this.parallelKernel.kernel.reduceSamplesByWeatherQuantiles({
      samples: body.samples ?? [],
      envWeatherRiskFallback01: body.envDefaults?.weatherRisk01 ?? 0.2,
      targetN: Math.max(1, targetReducedN),
    });

    const recentSignals =
      body.recentSignals ??
      (await this.audit.getRecentSignals({
        context: {
          userId: body.context?.userId,
          region: body.context?.region,
          countryCode: body.context?.countryCode,
          month: body.context?.month,
          vehicleClass: body.context?.vehicleClass,
        },
        limit: 50,
      }));

    const evalOut = await this.parallelKernel.kernel.evaluateRiskStochastic({
      samples: reduced.samples,
      edges: body.edges ?? [],
      envDefaults: body.envDefaults ?? { weatherRisk01: 0.2 },
      alpha,
      beta,
      batchSize: 50,
      ambiguitySignals: recentSignals,
    });

    const contextKey =
      body.context?.countryCode && body.context?.month && body.context?.vehicleClass
        ? buildContextKey({
            countryCode: body.context.countryCode,
            month: body.context.month,
            vehicleClass: body.context.vehicleClass,
          })
        : undefined;
    if (contextKey) {
      const consensus = await this.audit.updateConsensusEmergency({
        contextKey,
        signals: recentSignals as any,
      });
      if (consensus.isEmergency) {
        (evalOut as any).ambiguity = {
          gap01: 1,
          isRobustMode: true,
          isEmergency: true,
          reason: consensus.reason ?? '[紧急] 群体共识触发，已进入极端安全模式。',
        };
      }
    }

    const drivers = this.parallelKernel.kernel.identifyFailureDrivers({
      perScenario: evalOut.perScenario,
      samples: reduced.samples,
      edges: body.edges ?? [],
      envDefaults: body.envDefaults ?? { weatherRisk01: 0.2 },
      alpha,
      topMEdges: body.topMEdges ?? 8,
    });

    const realtimeState: RealtimeState =
      body.realtimeState ??
      ({
        at: new Date().toISOString(),
        lat: 0,
        lng: 0,
        delayMinutes: 0,
      } as RealtimeState);

    const intervention = await this.intervention.checkAndIntervene(realtimeState, {
      aggregate: evalOut.aggregate,
      ambiguity: evalOut.ambiguity,
      failureDrivers: drivers,
    });

    await this.maybeLogShadowDecision({
      shadowMode,
      userId: body.context?.userId,
      tripId: body.tripId,
      context: body.context,
      contextKey,
      recentSignals,
      ambiguity: evalOut.ambiguity,
      failureDrivers: drivers,
      intervention,
      aggregate: evalOut.aggregate,
      alpha,
      beta,
      realtimeState,
    });

    return {
      reducedReport: reduced.report,
      aggregate: evalOut.aggregate,
      ambiguity:
        shadowMode && evalOut.ambiguity?.isEmergency
          ? { ...evalOut.ambiguity, isEmergency: false, reason: `[SHADOW] ${evalOut.ambiguity.reason}` }
          : evalOut.ambiguity,
      failureDrivers: drivers,
    };
  }

  /**
   * A 阶段（流式）：分阶段交付以保持 UI 活跃响应。
   * - SUMMARY：精简报告 + 聚合指标（E/CVaR）
   * - DIAGNOSTICS：前 M 个失效驱动因素
   */
  @Public()
  @Post('predict-stream')
  async predictStream(
    @Body()
    body: {
      samples: BeliefStateSample[];
      edges: ScenarioEdgeEvalInput[];
      envDefaults: { weatherRisk01: number; windSpeedMs?: number };
      recentSignals?: CalibrationSignal[];
      context?: { userId?: string; region?: string; countryCode?: string; month?: number; vehicleClass?: VehicleClass };
      alpha?: number;
      beta?: number;
      targetReducedN?: number;
      topMEdges?: number;
      shadowMode?: boolean;
      realtimeState?: RealtimeState;
      tripId?: string;
    },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    const send = (stage: string, data: Record<string, unknown>) => {
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify({ stage, ...data })}\n\n`);
    };

    const alpha = body.alpha ?? 0.95;
    const beta = body.beta ?? 0.5;
    const shadowMode = !!body.shadowMode;
    const targetReducedN = body.targetReducedN ?? Math.min(100, body.samples?.length ?? 0);

    const reduced = this.parallelKernel.kernel.reduceSamplesByWeatherQuantiles({
      samples: body.samples ?? [],
      envWeatherRiskFallback01: body.envDefaults?.weatherRisk01 ?? 0.2,
      targetN: Math.max(1, targetReducedN),
    });

    const recentSignals =
      body.recentSignals ??
      (await this.audit.getRecentSignals({
        context: {
          userId: body.context?.userId,
          region: body.context?.region,
          countryCode: body.context?.countryCode,
          month: body.context?.month,
          vehicleClass: body.context?.vehicleClass,
        },
        limit: 50,
      }));

    const evalOut = await this.parallelKernel.kernel.evaluateRiskStochastic({
      samples: reduced.samples,
      edges: body.edges ?? [],
      envDefaults: body.envDefaults ?? { weatherRisk01: 0.2 },
      alpha,
      beta,
      batchSize: 50,
      ambiguitySignals: recentSignals,
    });

    const contextKey =
      body.context?.countryCode && body.context?.month && body.context?.vehicleClass
        ? buildContextKey({
            countryCode: body.context.countryCode,
            month: body.context.month,
            vehicleClass: body.context.vehicleClass,
          })
        : undefined;
    if (contextKey) {
      const consensus = await this.audit.updateConsensusEmergency({
        contextKey,
        signals: recentSignals as any,
      });
      if (consensus.isEmergency) {
        (evalOut as any).ambiguity = {
          gap01: 1,
          isRobustMode: true,
          isEmergency: true,
          reason: consensus.reason ?? '[紧急] 群体共识触发，已进入极端安全模式。',
        };
      }
    }

    const isEmergency = !!evalOut.ambiguity?.isEmergency;
    const outwardIsEmergency = shadowMode ? false : isEmergency;
    const outwardAmbiguity =
      shadowMode && evalOut.ambiguity?.isEmergency
        ? { ...evalOut.ambiguity, isEmergency: false, reason: `[SHADOW] ${evalOut.ambiguity.reason}` }
        : evalOut.ambiguity;

    send('SUMMARY', {
      reducedReport: reduced.report,
      aggregate: evalOut.aggregate,
      ambiguity: outwardAmbiguity,
      ...(outwardIsEmergency ? { isEmergency: true } : {}),
    });

    const realtimeState: RealtimeState =
      body.realtimeState ??
      ({
        at: new Date().toISOString(),
        lat: 0,
        lng: 0,
        delayMinutes: 0,
      } as RealtimeState);

    // 紧急截断：快速预警 + 最小化诊断信息（shadow 模式下不提前结束流）。
    if (isEmergency) {
      const topMEdgesEmergency = shadowMode ? (body.topMEdges ?? 8) : Math.min(3, body.topMEdges ?? 8);
      const driversEmergency = this.parallelKernel.kernel.identifyFailureDrivers({
        perScenario: evalOut.perScenario,
        samples: reduced.samples,
        edges: body.edges ?? [],
        envDefaults: body.envDefaults ?? { weatherRisk01: 0.2 },
        alpha,
        topMEdges: topMEdgesEmergency,
      });
      const interventionEmergency = await this.intervention.checkAndIntervene(realtimeState, {
        aggregate: evalOut.aggregate,
        ambiguity: evalOut.ambiguity,
        failureDrivers: driversEmergency,
      });
      send('DIAGNOSTICS', { failureDrivers: driversEmergency });
      await this.maybeLogShadowDecision({
        shadowMode,
        userId: body.context?.userId,
        tripId: body.tripId,
        context: body.context,
        contextKey,
        recentSignals,
        ambiguity: evalOut.ambiguity,
        failureDrivers: driversEmergency,
        intervention: interventionEmergency,
        aggregate: evalOut.aggregate,
        alpha,
        beta,
        realtimeState,
      });
      if (!shadowMode) {
        res.write(`event: end\n`);
        res.write(`data: {}\n\n`);
        res.end();
        return;
      }
    }

    const drivers = this.parallelKernel.kernel.identifyFailureDrivers({
      perScenario: evalOut.perScenario,
      samples: reduced.samples,
      edges: body.edges ?? [],
      envDefaults: body.envDefaults ?? { weatherRisk01: 0.2 },
      alpha,
      topMEdges: body.topMEdges ?? 8,
    });
    send('DIAGNOSTICS', { failureDrivers: drivers });

    if (shadowMode && !isEmergency) {
      const intervention = await this.intervention.checkAndIntervene(realtimeState, {
        aggregate: evalOut.aggregate,
        ambiguity: evalOut.ambiguity,
        failureDrivers: drivers,
      });
      await this.maybeLogShadowDecision({
        shadowMode,
        userId: body.context?.userId,
        tripId: body.tripId,
        context: body.context,
        contextKey,
        recentSignals,
        ambiguity: evalOut.ambiguity,
        failureDrivers: drivers,
        intervention,
        aggregate: evalOut.aggregate,
        alpha,
        beta,
        realtimeState,
      });
    }

    res.write(`event: end\n`);
    res.write(`data: {}\n\n`);
    res.end();
  }

  /**
   * B 阶段：反馈回路。
   * 接收观测结果并输出校准信号（用于存储 + 回归测试）。
   */
  @Public()
  @Post('risk-feedback')
  async riskFeedback(
    @Body()
    body: {
      itineraryId: string;
      userId: string;
      context?: { region?: string; countryCode?: string; month?: number; vehicleClass?: VehicleClass };
      at?: string;
      planId?: string;
      weatherRisk01: number;
      windSpeedMs?: number;
      edges: ScenarioEdgeEvalInput[];
      observed: ObservedEdgeOutcome[];
      samplesUsed?: RiskFeedbackEvent['samplesUsed'];
      alpha?: number;
    },
  ) {
    const predicted = buildPredictedEdgeFingerprints({
      edges: body.edges ?? [],
      weatherRisk01: body.weatherRisk01 ?? 0.2,
      windSpeedMs: body.windSpeedMs,
    });

    const event: RiskFeedbackEvent = {
      itineraryId: String(body.itineraryId ?? ''),
      planId: body.planId,
      at: body.at ?? new Date().toISOString(),
      alpha: body.alpha,
      samplesUsed: body.samplesUsed,
      predicted,
      observed: body.observed ?? [],
    };

    const calibrationSignals = deriveCalibrationSignals({
      predicted: event.predicted,
      observed: event.observed,
    });

    const ambiguity = this.ambiguity.calculateAmbiguity(calibrationSignals);
    await this.audit.logRiskFeedback({
      tripId: event.itineraryId,
      userId: body.userId,
      context: {
        userId: body.userId,
        region: body.context?.region,
        countryCode: body.context?.countryCode,
        month: body.context?.month,
        vehicleClass: body.context?.vehicleClass,
      },
      event,
      signals: calibrationSignals,
      ambiguity,
    });

    return { status: 'LEARNED', event, calibrationSignals, ambiguity };
  }
}
