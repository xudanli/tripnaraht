/**
 * DSO 稳定性监控服务
 *
 * 专利 4.14.3：V(DSO_t) ≤ V(DSO_{t−1})，证明系统在扰动下稳定
 * V(dso) = 1 - consistencyScore，当 version 递增且 consistency 通过时 V 不增
 *
 * 参考：docs/Decision_OS_技术交底书.md 4.14.3
 */

import { Injectable } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { IDSOStabilityMonitor } from './dso-stability.interface';

@Injectable()
export class DSOStabilityMonitorService implements IDSOStabilityMonitor {
  /**
   * 计算 DSO Lyapunov 函数值 V(curr)
   * V = 1 - consistencyScore，consistent 时 V≈0，不一致时 V≈1
   */
  computeDSOLyapunov(_prev: DecisionState, curr: DecisionState): number {
    const consistencyScore = this.computeConsistencyScore(curr);
    return Math.max(0, 1 - consistencyScore);
  }

  /** 一致性得分 [0,1]：结构有效 + 约束可行 */
  private computeConsistencyScore(dso: DecisionState): number {
    const sys = dso.systemState;
    if (!sys) return 0;
    if (typeof sys.version !== 'number' || sys.version < 0) return 0;
    if (!sys.lastUpdatedAt || typeof sys.lastUpdatedAt !== 'string') return 0;

    let score = 1;
    const constraints = dso.constraints;
    if (constraints?.feasible === false) {
      const hasHard = constraints.violations?.some((v) => v.severity === 'HARD');
      score = hasHard ? 0 : 0.5;
    }
    return score;
  }

  /** 检查稳定性：V_{k+1} ≤ V_k */
  checkStability(vNew: number, vPrev: number): boolean {
    return vNew <= vPrev + 1e-9;
  }

  /**
   * 专利理论顶级：严格 Lyapunov 递减 ΔV = V_{k+1} − V_k ≤ −ε
   * 当 ε > 0 时，V 严格递减，系统收敛至平衡点（控制理论级）
   */
  checkStrictStability(vNew: number, vPrev: number, epsilon = 0.01): boolean {
    return vNew <= vPrev - epsilon + 1e-9;
  }
}
