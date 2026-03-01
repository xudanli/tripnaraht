/**
 * Constraint Engine Adapter
 *
 * Phase 2.2: Kernel 与约束检查的桥接
 * - 当 state.constraints 已存在（来自 Gate 映射）时直接返回
 * - P1: 可选调用 trips ConstraintEngineService.isFeasible()
 *   DSO→TripWorldState+TripPlan 转换（Itinerary→PlanDay[]、UserIntent→context）
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md, docs/DECISION_KERNEL_DEV_TEAM_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionState, ConstraintReport } from './decision-state.types';
import { ConstraintEngineService } from '../../trips/decision/constraints/constraint-engine.service';
import {
  itineraryToTripPlan,
  decisionStateToTripWorldState,
} from './dso-to-trips-converter';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';

@Injectable()
export class ConstraintEngineAdapterService {
  private readonly logger = new Logger(ConstraintEngineAdapterService.name);

  constructor(
    @Optional() private readonly constraintEngine?: ConstraintEngineService,
  ) {}

  /**
   * 获取约束报告（同步）
   * 当 constraints 已由 OrchestratorState 映射填入时直接返回
   */
  getReport(state: DecisionState): DecisionState['constraints'] {
    if (state.constraints) {
      this.logger.debug(`[ConstraintAdapter] 使用已有 constraints: feasible=${state.constraints.feasible}`);
      return state.constraints;
    }
    return undefined;
  }

  /**
   * 获取约束报告（异步，可选调用 trips ConstraintEngine）
   * 当 constraints 未设置且 planDraft 存在时，调用 isFeasible 并映射为 ConstraintReport
   */
  async getReportAsync(state: DecisionState): Promise<ConstraintReport | undefined> {
    if (state.constraints) {
      this.logger.debug(`[ConstraintAdapter] 使用已有 constraints: feasible=${state.constraints.feasible}`);
      return state.constraints as ConstraintReport;
    }

    const planDraft = state.tripState?.planDraft as Itinerary | undefined;
    if (!planDraft?.days?.length || !this.constraintEngine) {
      return undefined;
    }

    try {
      const tripWorldState = decisionStateToTripWorldState(state);
      const tripPlan = itineraryToTripPlan(planDraft);
      const result = await this.constraintEngine.isFeasible(tripWorldState, tripPlan);

      const violations = result.violations.map((v) => ({
        type: v.code,
        severity: (v.severity === 'error' ? 'HARD' : 'SOFT') as 'HARD' | 'SOFT',
        detail: v.message,
        // Phase 2 研究级：g_i(s,a) 违反程度，用于约束优化形式
        degree: v.severity === 'error' ? 1 : v.severity === 'warning' ? 0.5 : 0.2,
      }));

      const report: ConstraintReport = {
        feasible: result.feasible,
        violations,
        feasibleActions: result.infeasibilityExplanation?.reasons?.flatMap((r) => r.fix_suggestions ?? []),
      };

      this.logger.debug(
        `[ConstraintAdapter] trips isFeasible: feasible=${result.feasible}, violations=${violations.length}`,
      );
      return report;
    } catch (error: any) {
      this.logger.warn(`[ConstraintAdapter] trips isFeasible 失败: ${error?.message}`);
      return undefined;
    }
  }
}
