// src/trips/decision/constraints/constraint-engine.service.ts

/**
 * Constraint Engine - 决策空间剪枝器
 *
 * Phase 0 交付物：isFeasible(plan) 统一入口
 *
 * 设计原则（EXPECTED_UTILITY_AND_CONSTRAINT_ENGINE_DESIGN.md）：
 * - 硬约束违规 → 方案直接淘汰，不进入 ExpectedUtility 评分
 * - LLM 不负责判断可行性，工程负责可行性
 */

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import {
  ConstraintChecker,
  ConstraintCheckResult,
  CheckerViolation,
  InfeasibilityExplanation,
} from './constraint-checker';
import {
  isConstraintEvaluationGatewayEnabled,
  isConstraintGatewayAuthorityMode,
  isConstraintGatewayDualRunEligible,
  isConstraintGatewayOnForSelectedMode,
} from '../../../decision-runtime/constraints/constraint-evaluation.config';
import {
  detectConstraintScenarioIds,
  shouldUseCanonicalConstraintAuthority,
} from '../../../decision-runtime/constraints/constraint-on-selected.util';
import { ConstraintEvaluationGatewayService } from '../../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import type { ConstraintEvaluationShadowComparison } from '../../../decision-runtime/constraints/constraint-evaluation-shadow-compare.util';
import { buildConstraintEvaluationShadowComparison } from '../../../decision-runtime/constraints/constraint-evaluation-shadow-compare.util';
import type { CanonicalConstraintReport } from '../../../decision-runtime/constraints/contracts/canonical-constraint-report';
import { mapReportToFeasibilityResult } from '../../../decision-runtime/constraints/feasibility-result.mapper';
import { ConstraintShadowMetricsService } from '../../../decision-runtime/constraints/constraint-shadow-metrics.service';
import type { PackRuleConstraintInput } from '../../../decision-runtime/packs/rules/pack-rule-constraint.types';
import type { WorldStateDataAvailability } from '../../../decision-runtime/constraints/contracts/world-state-completeness';
import { isConstraintCandidateFacadeEnabled } from '../../../decision-runtime/constraints/constraint-plan-verify.config';
import { CandidateConstraintFacade } from '../../../decision-runtime/constraints/services/candidate-constraint-facade.service';
import { resolveDecisionScopeForGateway } from '../../../decision-runtime/constraints/resolve-decision-scope-for-gateway.util';

/**
 * 可行性检查结果
 *
 * 用于「约束前置」流程：Generate → Filter(isFeasible) → Score → Rank → LLM
 */
export interface FeasibilityResult {
  /** 是否可行（无硬约束违规） */
  feasible: boolean;

  /** 所有违规（含 error / warning / info） */
  violations: CheckerViolation[];

  /** 不可行时的结构化解释（供 LLM 说明为何不推荐） */
  infeasibilityExplanation?: InfeasibilityExplanation;

  /** 原始检查结果（供需要更多信息的调用方使用） */
  rawCheckResult: ConstraintCheckResult;

  /** Canonical report when gateway ran (SHADOW_COMPARE / ON). */
  canonicalReport?: CanonicalConstraintReport;

  /** Dual-run comparison when CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE. */
  constraintShadowComparison?: ConstraintEvaluationShadowComparison;
}

@Injectable()
export class ConstraintEngineService {
  constructor(
    @Optional() private readonly constraintChecker?: ConstraintChecker,
    @Inject(forwardRef(() => ConstraintEvaluationGatewayService))
    @Optional()
    private readonly evaluationGateway?: ConstraintEvaluationGatewayService,
    @Inject(forwardRef(() => ConstraintShadowMetricsService))
    @Optional()
    private readonly shadowMetrics?: ConstraintShadowMetricsService,
    @Inject(forwardRef(() => CandidateConstraintFacade))
    @Optional()
    private readonly candidateFacade?: CandidateConstraintFacade,
  ) {}

  /**
   * 判断方案是否可行
   *
   * 硬约束违规（violations.severity === 'error'）→ feasible = false
   * 仅 warning/info → feasible = true（可参与评分，软约束转为 Penalty）
   *
   * @param state 旅行世界状态
   * @param plan 待检查的方案
   * @returns 可行性结果
   */
  async isFeasible(
    state: TripWorldState,
    plan: TripPlan
  ): Promise<FeasibilityResult> {
    const tripId = state.context.tripId ?? plan.tripId ?? 'unknown';

    if (isConstraintCandidateFacadeEnabled() && this.candidateFacade) {
      const gatewayInput = this.buildGatewayEvaluateInput(tripId, state, plan);
      const facadeResult = await this.candidateFacade.evaluateCandidate({
        ...gatewayInput,
        evaluationMode: 'CANDIDATE_FILTER',
      });
      return {
        feasible: facadeResult.feasible,
        violations: facadeResult.violations,
        infeasibilityExplanation: facadeResult.infeasibilityExplanation,
        rawCheckResult: facadeResult.rawCheckResult,
        canonicalReport: facadeResult.canonicalReport,
      };
    }

    if (isConstraintEvaluationGatewayEnabled() && this.evaluationGateway) {
      const gatewayInput = this.buildGatewayEvaluateInput(tripId, state, plan);
      const report = await this.evaluationGateway.evaluatePlan({
        ...gatewayInput,
        evaluationMode: 'CANDIDATE_FILTER',
      });
      const canonicalResult = mapReportToFeasibilityResult(report);

      if (isConstraintGatewayAuthorityMode()) {
        return { ...canonicalResult, canonicalReport: report };
      }

      const scenarioIds = detectConstraintScenarioIds({
        packContext: gatewayInput.packContext,
        signals: state.signals as unknown as Record<string, unknown> | undefined,
      });
      const selectedAuthority =
        isConstraintGatewayOnForSelectedMode() &&
        shouldUseCanonicalConstraintAuthority(scenarioIds);

      if (selectedAuthority) {
        const legacyResult = await this.evaluateLegacyFeasibility(state, plan);
        const constraintShadowComparison = buildConstraintEvaluationShadowComparison({
          legacyFeasible: legacyResult.feasible,
          canonicalReport: report,
        });
        this.shadowMetrics?.recordComparison(constraintShadowComparison);
        return {
          ...canonicalResult,
          canonicalReport: report,
          constraintShadowComparison,
        };
      }

      if (isConstraintGatewayDualRunEligible() && !selectedAuthority) {
        const legacyResult = await this.evaluateLegacyFeasibility(state, plan);
        const constraintShadowComparison = buildConstraintEvaluationShadowComparison({
          legacyFeasible: legacyResult.feasible,
          canonicalReport: report,
        });
        this.shadowMetrics?.recordComparison(constraintShadowComparison);
        return {
          ...legacyResult,
          canonicalReport: report,
          constraintShadowComparison,
        };
      }

      return { ...canonicalResult, canonicalReport: report };
    }

    return this.evaluateLegacyFeasibility(state, plan);
  }

  private buildGatewayEvaluateInput(
    tripId: string,
    state: TripWorldState,
    plan: TripPlan,
  ) {
    const ext = state as TripWorldState & {
      packContext?: PackRuleConstraintInput;
      dataAvailability?: WorldStateDataAvailability;
      decisionScope?: import('../../../decision-runtime/contracts/decision-scope.types').DecisionScope;
      worldStateSnapshotId?: string;
    };
    const signals = state.signals as unknown as Record<string, unknown> | undefined;
    const packContext =
      ext.packContext ??
      (signals?.packContext as PackRuleConstraintInput | undefined);

    const scopeBinding = resolveDecisionScopeForGateway({
      tripId,
      signals: {
        ...(signals ?? {}),
        ...(ext.decisionScope ? { decisionScope: ext.decisionScope } : {}),
        ...(ext.worldStateSnapshotId
          ? { worldStateSnapshotId: ext.worldStateSnapshotId }
          : {}),
      },
      packContext,
    });

    return {
      tripId,
      plan,
      worldState: state,
      packContext,
      dataAvailability:
        ext.dataAvailability ??
        (signals?.dataAvailability as WorldStateDataAvailability | undefined),
      decisionScope: scopeBinding.decisionScope,
      worldStateSnapshotId: scopeBinding.worldStateSnapshotId,
      scopeMutationCandidate: scopeBinding.scopeMutationCandidate,
    };
  }

  private async evaluateLegacyFeasibility(
    state: TripWorldState,
    plan: TripPlan,
  ): Promise<FeasibilityResult> {
    if (!this.constraintChecker) {
      return {
        feasible: true,
        violations: [],
        rawCheckResult: {
          violations: [],
          isValid: true,
          summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
        },
      };
    }

    const checkResult = await this.constraintChecker.checkPlan(state, plan);

    return {
      feasible: checkResult.isValid,
      violations: checkResult.violations,
      infeasibilityExplanation: checkResult.infeasibilityExplanation,
      rawCheckResult: checkResult,
    };
  }

  /**
   * 快速判断是否可行（仅 boolean，不返回详情）
   */
  async checkFeasible(state: TripWorldState, plan: TripPlan): Promise<boolean> {
    const result = await this.isFeasible(state, plan);
    return result.feasible;
  }
}
