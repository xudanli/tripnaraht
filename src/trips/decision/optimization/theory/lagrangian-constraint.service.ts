/**
 * 拉格朗日约束优化服务
 *
 * 专利 3.13.5：L(a,λ) = U(a|b) − Σ λ_i g_i(s,a)
 * min_{λ≥0} max_a L(a,λ)
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.5
 */

import { Injectable } from '@nestjs/common';
import {
  ILagrangianConstraintService,
  LagrangianInput,
  LagrangianOutput,
  ConstraintValue,
} from './lagrangian-constraint.interface';

@Injectable()
export class LagrangianConstraintService implements ILagrangianConstraintService {
  /**
   * 计算拉格朗日函数 L(a,λ) = U(a|b) − Σ_i λ_i · g_i(s,a)
   */
  computeLagrangian(input: LagrangianInput, multipliers: number[]): LagrangianOutput {
    const { utility, constraints } = input;
    let penalty = 0;
    const used = multipliers.slice(0, constraints.length);
    for (let i = 0; i < constraints.length; i++) {
      const lambda = multipliers[i] ?? 0;
      const gi = constraints[i].value;
      penalty += Math.max(0, lambda) * Math.max(0, gi); // 仅当 g_i > 0 时惩罚
    }
    return {
      lagrangianValue: utility - penalty,
      multipliers: used,
    };
  }

  /**
   * 对偶目标：给定 λ，L(a,λ) = U − Σ λ_i g_i
   */
  dualObjective(utility: number, constraints: ConstraintValue[], multipliers: number[]): number {
    let penalty = 0;
    for (let i = 0; i < constraints.length; i++) {
      const lambda = multipliers[i] ?? 0;
      penalty += Math.max(0, lambda) * Math.max(0, constraints[i].value);
    }
    return utility - penalty;
  }
}
