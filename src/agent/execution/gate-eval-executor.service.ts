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
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';
import { ClaudeGatekeeperAgentService } from '../services/sub-agents/gatekeeper-agent.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { UserDecisionService } from '../../trips/readiness/services/user-decision.service';
import type { TripPlanRequest, OrchestratorState } from '../interfaces/trip-plan.interface';

@Injectable()
export class GateEvalExecutorService implements IGateEvalExecutor {
  private readonly logger = new Logger(GateEvalExecutorService.name);

  constructor(
    private readonly tripContextExtractor: TripContextExtractorService,
    @Optional() private readonly readinessService?: ReadinessService,
    @Optional() private readonly userDecisionService?: UserDecisionService,
    @Optional() private readonly gatekeeperAgent?: ClaudeGatekeeperAgentService,
  ) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ constraints: ConstraintReport; gateResult: GateResultLike }> {
    this.logger.debug(`[GateEvalExecutor] 执行 GATE_EVAL 阶段 requestId=${ctx.requestId}`);

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
      return {
        constraints: { feasible: false, violations: gateResult.violations },
        gateResult,
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
        constraints: { feasible: false, violations: [] },
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
      };
      return {
        constraints,
        gateResult: {
          gate_result: gateResult.gate_result,
          violations: gateResult.violations || [],
          required_adjustments: gateResult.required_adjustments || [],
          confidence: gateResult.confidence ?? 0.8,
        },
      };
    }

    // 降级：默认 ALLOW
    const gateResult: GateResultLike = {
      gate_result: readinessMust.length > 0 ? 'ADJUST_REQUIRED' : 'ALLOW',
      violations: [],
      required_adjustments: readinessMust.map((item: any) => ({
        action: 'REPLACE_SEGMENT',
        why: typeof item.message === 'string' ? item.message : item.message?.zh || item.message?.en || '',
      })),
      confidence: 0.8,
    };
    return {
      constraints: { feasible: gateResult.gate_result === 'ALLOW', violations: [], feasibleActions: [] },
      gateResult,
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
