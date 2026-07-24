import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { dsoToMinimalWorldModelContext } from '../../../decision/kernel/dso-to-world-model-converter';
import {
  ExpectedUtilityService,
  DEFAULT_MONTE_CARLO_CONFIG,
  type ExpectedUtilityResult,
} from '../../decision/optimization/probabilistic/expected-utility.service';
import {
  DEFAULT_UNCERTAINTY_CONFIG,
  type ProbabilisticWorldModelContext,
  type WorldStateObservation,
} from '../../decision/optimization/probabilistic/probabilistic-world-model.interface';
import { ProbabilisticWorldModelService as ProbabilisticWorldModelServiceImpl } from '../../decision/optimization/probabilistic/probabilistic-world-model.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../decision/optimization/objective-function.interface';
import {
  BeliefUpdateService,
  type BeliefState,
} from '../../decision/optimization/probabilistic/belief-update.service';
import { WorldBuildContextSkill } from '../../../skills/world/world-build-context.skill';
import type { FeasibilityProbabilisticAssessmentDto } from '../types/trip-constraint-solver.types';
import { synthesizeRoutePlanDraftFromTrip } from '../utils/trip-route-plan-draft.util';
import type { ReadinessScoreResponse } from '../../readiness/types/coverage-map.types';
import { ObjectiveFunctionService } from '../../decision/optimization/objective-function.service';
import { assessMonteCarloDeterministicAlignment } from '../utils/feasibility-mc-alignment.util';
import { emitDecisionOsAuditReport } from '../../../agent/contracts/decision-os-audit-emitter';

export interface FeasibilityMonteCarloRunOptions {
  tripId: string;
  readiness?: ReadinessScoreResponse;
  sampleSize?: number;
  runPomdpBeliefUpdate?: boolean;
}

@Injectable()
export class FeasibilityPomdpMonteCarloService {
  private readonly logger = new Logger(FeasibilityPomdpMonteCarloService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly expectedUtility?: ExpectedUtilityService,
    @Optional() private readonly probabilisticWorldModel?: ProbabilisticWorldModelServiceImpl,
    @Optional() private readonly beliefUpdate?: BeliefUpdateService,
    @Optional() private readonly worldBuildContext?: WorldBuildContextSkill,
    @Optional() private readonly objectiveFunction?: ObjectiveFunctionService,
  ) {}

  isEnabled(): boolean {
    if (!this.expectedUtility || !this.probabilisticWorldModel) return false;
    const raw = (process.env.FEASIBILITY_MONTE_CARLO ?? '1').trim().toLowerCase();
    return !['0', 'false', 'off', 'no'].includes(raw);
  }

  resolveSampleSize(override?: number): number {
    if (override && override > 0) {
      return Math.min(500, Math.max(50, Math.floor(override)));
    }
    const fromEnv = Number(process.env.FEASIBILITY_MONTE_CARLO_SAMPLES ?? 200);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return Math.min(500, Math.max(50, Math.floor(fromEnv)));
    }
    return 200;
  }

  async assess(
    opts: FeasibilityMonteCarloRunOptions,
  ): Promise<FeasibilityProbabilisticAssessmentDto | null> {
    if (!this.isEnabled()) {
      return { method: 'UNAVAILABLE', narrative: 'Monte Carlo 未启用或 Optimization 模块未注入' };
    }

    const startMs = Date.now();
    const sampleSize = this.resolveSampleSize(opts.sampleSize);

    const [plan, worldResolution] = await Promise.all([
      synthesizeRoutePlanDraftFromTrip(this.prisma, opts.tripId),
      this.resolveWorldContext(opts.tripId),
    ]);
    const world = worldResolution?.world;

    if (!plan || !world) {
      return {
        method: 'UNAVAILABLE',
        narrative: '缺少行程草案或世界模型，无法运行 Monte Carlo',
        monteCarloDiagnostics: {
          sampleSize: 0,
          convergenceAchieved: false,
          effectiveSampleSize: 0,
          durationMs: Date.now() - startMs,
        },
      };
    }

    let probabilisticContext = this.probabilisticWorldModel!.fromDeterministicModel(
      world,
      DEFAULT_UNCERTAINTY_CONFIG,
    );

    let pomdpMeta: FeasibilityProbabilisticAssessmentDto['pomdp'] = {
      beliefRefinement: 'NONE',
      independenceTier: 'NONE',
      worldSource: worldResolution?.source ?? 'dso_stub',
    };

    if (opts.runPomdpBeliefUpdate !== false && this.beliefUpdate) {
      const pomdpOutcome = await this.refineBeliefWithObservations(
        probabilisticContext,
        opts.readiness,
      );
      if (pomdpOutcome) {
        probabilisticContext = pomdpOutcome.context;
        pomdpMeta = {
          beliefRefinement: 'POMDP',
          effectiveParticleCount: pomdpOutcome.effectiveParticleCount,
          observationSources: pomdpOutcome.observationSources,
          logNormalizationConstant: pomdpOutcome.logNormalizationConstant,
          observationProvenance: pomdpOutcome.observationProvenance,
          independenceTier: pomdpOutcome.independenceTier,
          worldSource: worldResolution?.source ?? 'dso_stub',
        };
      }
    }

    const mcResult = this.expectedUtility!.computeExpectedUtility(
      plan,
      probabilisticContext,
      DEFAULT_OBJECTIVE_WEIGHTS,
      {
        ...DEFAULT_MONTE_CARLO_CONFIG,
        sampleSize,
        deterministicWorld: world,
      },
    );

    const assessment = this.mapMonteCarloResult(
      mcResult,
      sampleSize,
      Date.now() - startMs,
      pomdpMeta,
      {
        worldSource: worldResolution?.source ?? 'dso_stub',
        planSegmentCount: plan.segments?.length ?? 0,
        plan,
        world,
      },
    );
    this.logger.debug(
      `[FeasibilityMC] trip=${opts.tripId} P(feasible)=${assessment.feasibilityProbability?.toFixed(3)} E[U]=${assessment.expectedUtility?.toFixed(3)} samples=${sampleSize}`,
    );

    if (assessment.audit && assessment.method === 'MONTE_CARLO') {
      const normalized = emitDecisionOsAuditReport(this.logger, {
        request_id: `feasibility-${opts.tripId}`,
        phase: 'FEASIBILITY_MC_VALIDATE',
        terminal: true,
        dominant_cid: assessment.audit.dominant_cid ?? 'MC_ASSESS',
        session_consistency_score: assessment.audit.session_consistency_score ?? 90,
        delta_reason:
          assessment.audit.drift_vector &&
          Math.abs(assessment.audit.drift_vector.delta_feasibility_proxy) > 0.25
            ? 'mc_det_feasibility_drift'
            : 'aligned',
        delta_utility: assessment.audit.drift_vector?.delta_utility ?? 0,
        extra: {
          feasibility_probability: assessment.feasibilityProbability,
          world_source: assessment.pomdp?.worldSource,
          plan_segment_count: assessment.audit.planSegmentCount,
        },
      });
      assessment.audit.decisionOsAudit = normalized.audit_report;
    }

    return assessment;
  }

  private async resolveWorldContext(
    tripId: string,
  ): Promise<{ world: Awaited<ReturnType<typeof dsoToMinimalWorldModelContext>>; source: 'world.buildContext' | 'dso_stub' } | null> {
    if (this.worldBuildContext) {
      try {
        const built = await this.worldBuildContext.execute({
          tripId,
          phase: 'PLANNING',
          agent: 'FeasibilityReport',
          tokenBudget: 2000,
        });
        if (built.world) {
          return { world: built.world, source: 'world.buildContext' };
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[FeasibilityMC] world.buildContext 失败，降级 stub: ${msg}`);
      }
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true, startDate: true },
    });
    const dso: DecisionState = {
      userIntent: {
        destination: trip?.destination ?? 'unknown',
        dateRange: trip?.startDate
          ? {
              startDate: trip.startDate.toISOString().slice(0, 10),
              endDate: trip.startDate.toISOString().slice(0, 10),
            }
          : undefined,
      },
      tripState: {},
      environmentState: {
        countryCode: (trip?.destination ?? 'IS').slice(0, 2).toUpperCase(),
        weatherRisk: 0.35,
      },
      systemState: { requestId: `feasibility-${tripId}` },
      requestId: `feasibility-${tripId}`,
    };
    return { world: dsoToMinimalWorldModelContext(dso), source: 'dso_stub' };
  }

  private async refineBeliefWithObservations(
    context: ProbabilisticWorldModelContext,
    readiness?: ReadinessScoreResponse,
  ): Promise<{
    context: ProbabilisticWorldModelContext;
    effectiveParticleCount: number;
    observationSources: string[];
    observationProvenance: string;
    independenceTier: 'INDIRECT_PROXY';
    logNormalizationConstant?: number;
  } | null> {
    if (!this.probabilisticWorldModel || !this.beliefUpdate) return null;

    const built = this.buildObservationFromReadiness(readiness);
    if (!built) return null;
    const { observation, sources } = built;

    const initialSamples = this.probabilisticWorldModel.sampleWorldState(context, 16);
    const currentBelief: BeliefState[] = initialSamples.map((sample, i) => ({
      particleId: `feas-belief-${i}`,
      sample,
      weight: 1 / initialSamples.length,
    }));

    try {
      const updated = await this.beliefUpdate.updateBelief(context, {
        currentBelief,
        action: { type: 'FEASIBILITY_VALIDATE' },
        observation,
      });

      const refinedContext = this.probabilisticWorldModel.updateWithObservation(context, observation);
      return {
        context: refinedContext,
        effectiveParticleCount: updated.effectiveParticleCount,
        observationSources: sources,
        observationProvenance:
          'readiness.scheduleFeasibility/transportCertainty → windSpeed 间接代理（非直接气象观测）',
        independenceTier: 'INDIRECT_PROXY',
        logNormalizationConstant: updated.logNormalizationConstant,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[FeasibilityMC] POMDP belief update 跳过: ${msg}`);
      return null;
    }
  }

  private buildObservationFromReadiness(
    readiness?: ReadinessScoreResponse,
  ): { observation: WorldStateObservation; sources: string[] } | null {
    if (!readiness?.score) return null;

    const scheduleFeas = readiness.score.scheduleFeasibility;
    const transportFeas = readiness.score.transportCertainty;
    if (scheduleFeas == null && transportFeas == null) {
      return null;
    }

    const sources: string[] = [];
    const scheduleRisk =
      scheduleFeas != null ? Math.max(0, Math.min(1, 1 - scheduleFeas / 100)) : 0;
    const transportRisk =
      transportFeas != null ? Math.max(0, Math.min(1, 1 - transportFeas / 100)) : 0;
    const envRisk = (scheduleRisk + transportRisk) / (scheduleFeas != null && transportFeas != null ? 2 : 1);
    const windSpeedMs = 5 + envRisk * 20;

    if (scheduleRisk > 0.05) sources.push('readiness.score.scheduleFeasibility');
    if (transportRisk > 0.05) sources.push('readiness.score.transportCertainty');

    if (!sources.length) return null;

    return {
      observation: {
        timestamp: new Date().toISOString(),
        type: 'WEATHER',
        observation: { variable: 'windSpeed', value: windSpeedMs },
        quality: 'MEDIUM',
      },
      sources,
    };
  }

  private mapMonteCarloResult(
    result: ExpectedUtilityResult,
    sampleSize: number,
    durationMs: number,
    pomdp?: FeasibilityProbabilisticAssessmentDto['pomdp'],
    auditContext?: {
      worldSource: string;
      planSegmentCount: number;
      plan: import('../../decision/shared/world-model.types').RoutePlanDraft;
      world: import('../../decision/shared/world-model.types').WorldModelContext;
    },
  ): FeasibilityProbabilisticAssessmentDto {
    const keyRiskFactors = this.deriveKeyRiskFactors(result);
    const narrative = this.buildNarrative(result, keyRiskFactors);

    let audit: FeasibilityProbabilisticAssessmentDto['audit'];
    if (auditContext && result.feasibilityProbability != null && result.expectedUtility != null) {
      let alignment = {
        session_consistency_score: 90,
        dominant_cid: 'MC_ONLY',
        drift_vector: { delta_utility: 0, delta_feasibility_proxy: 0 },
      };
      if (this.objectiveFunction) {
        try {
          const det = this.objectiveFunction.evaluate(auditContext.plan, auditContext.world);
          const report = assessMonteCarloDeterministicAlignment(
            {
              feasibilityProbability: result.feasibilityProbability,
              expectedUtility: result.expectedUtility,
            },
            {
              totalUtility: det.totalUtility,
              hardViolationCount: det.constraints.hardViolations.filter(
                (v) => v.violationDegree > 0,
              ).length,
            },
          );
          alignment = {
            session_consistency_score: report.session_consistency_score,
            dominant_cid: report.dominant_cid,
            drift_vector: report.drift_vector,
          };
        } catch {
          // alignment is best-effort
        }
      }
      audit = {
        event: 'feasibility_mc_assess',
        feasibilityProbability: result.feasibilityProbability,
        expectedUtility: result.expectedUtility,
        sampleSize,
        worldSource: auditContext.worldSource,
        planSegmentCount: auditContext.planSegmentCount,
        session_consistency_score: alignment.session_consistency_score,
        dominant_cid: alignment.dominant_cid,
        drift_vector: alignment.drift_vector,
      };
    }

    return {
      method: 'MONTE_CARLO',
      feasibilityProbability: result.feasibilityProbability,
      expectedUtility: result.expectedUtility,
      confidenceInterval: result.confidenceInterval,
      riskMetrics: {
        downRiskProbability: result.riskMetrics.downRiskProbability,
        worstCase: result.riskMetrics.worstCase,
        bestCase: result.riskMetrics.bestCase,
        volatility: result.riskMetrics.volatility,
      },
      dimensionExpectations: result.dimensionExpectations,
      pomdp,
      audit,
      monteCarloDiagnostics: {
        sampleSize,
        convergenceAchieved: result.samplingDetails.convergenceAchieved,
        effectiveSampleSize: result.samplingDetails.effectiveSampleSize,
        durationMs,
      },
      keyRiskFactors,
      narrative,
    };
  }

  private deriveKeyRiskFactors(result: ExpectedUtilityResult): string[] {
    const factors: string[] = [];
    const dims = result.dimensionExpectations;
    if (dims.weatherRisk > 0.55) factors.push('天气风险偏高');
    if (dims.fatigueRisk > 0.55) factors.push('疲劳风险偏高');
    if (dims.budgetOverrun > 0.5) factors.push('预算超支风险');
    if (result.riskMetrics.downRiskProbability > 0.25) {
      factors.push(`下行风险 ${(result.riskMetrics.downRiskProbability * 100).toFixed(0)}%`);
    }
    if (result.feasibilityProbability < 0.6) {
      factors.push(`可执行概率 ${(result.feasibilityProbability * 100).toFixed(0)}%`);
    }
    return factors.slice(0, 5);
  }

  private buildNarrative(result: ExpectedUtilityResult, keyRiskFactors: string[]): string {
    const p = (result.feasibilityProbability * 100).toFixed(0);
    const eu = result.expectedUtility.toFixed(2);
    const ci = result.confidenceInterval;
    const base = `蒙特卡洛评估：可执行概率约 ${p}%，期望效用 ${eu}（${(ci.level * 100).toFixed(0)}% 区间 ${ci.lower.toFixed(2)}–${ci.upper.toFixed(2)}）。此为辅助概率评估，不覆盖 must_handle 确定性门控。`;
    if (!keyRiskFactors.length) return base;
    return `${base} 主要风险：${keyRiskFactors.join('、')}。`;
  }
}
