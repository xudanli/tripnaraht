/**
 * DSO 稳定性监控接口
 *
 * 专利 4.14.3：V(DSO_t) ≤ V(DSO_{t−1})，证明系统在扰动下稳定
 *
 * 参考：docs/Decision_OS_技术交底书.md 4.14.3
 * 实现方案：docs/DECISION_OS_ULTIMATE_THEORY_IMPLEMENTATION_PLAN.md
 */

import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

export interface IDSOStabilityMonitor {
  /** 计算 DSO Lyapunov 函数值 V(dso) = 1 - consistencyScore */
  computeDSOLyapunov(prev: DecisionState, curr: DecisionState): number;
  /** 检查稳定性：V_new ≤ V_prev */
  checkStability(vNew: number, vPrev: number): boolean;
  /** 专利理论顶级：严格 Lyapunov 递减 ΔV ≤ −ε，控制理论级稳定证明 */
  checkStrictStability(vNew: number, vPrev: number, epsilon?: number): boolean;
}
