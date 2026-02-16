/**
 * Constraint Engine Adapter
 *
 * Phase 2.2: Kernel 与约束检查的桥接
 * - 当 state.constraints 已存在（来自 Gate 映射）时直接返回
 * - 未来可扩展：调用 trips ConstraintEngineService.isFeasible()
 *   需 DSO→TripWorldState+TripPlan 转换（Itinerary→PlanDay[]、UserIntent→context 等）
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionState } from './decision-state.types';

@Injectable()
export class ConstraintEngineAdapterService {
  private readonly logger = new Logger(ConstraintEngineAdapterService.name);

  /**
   * 获取约束报告
   * 当 constraints 已由 OrchestratorState 映射填入时直接返回
   */
  getReport(state: DecisionState): DecisionState['constraints'] {
    if (state.constraints) {
      this.logger.debug(`[ConstraintAdapter] 使用已有 constraints: feasible=${state.constraints.feasible}`);
      return state.constraints;
    }
    // TODO Phase 2.2+: 调用 trips ConstraintEngineService.isFeasible 需 DSO→TripWorldState+TripPlan 适配
    return undefined;
  }
}
