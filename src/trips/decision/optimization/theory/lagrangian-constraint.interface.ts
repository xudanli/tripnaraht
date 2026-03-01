/**
 * 拉格朗日约束优化接口
 *
 * 专利 3.13.5：L(a,λ) = U(a|b) − Σ λ_i g_i(s,a)
 * min_{λ≥0} max_a L(a,λ)
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.5
 */

/** 约束函数值 g_i(s,a)，g_i ≤ 0 表示满足 */
export interface ConstraintValue {
  index: number;
  type: string;
  value: number; // g_i(s,a)
}

/** 拉格朗日输入 */
export interface LagrangianInput {
  /** 效用 U(a|b) */
  utility: number;
  /** 约束值列表 g_i(s,a) */
  constraints: ConstraintValue[];
}

/** 拉格朗日输出 */
export interface LagrangianOutput {
  /** L(a,λ) = U − Σ λ_i g_i */
  lagrangianValue: number;
  /** 使用的乘子 */
  multipliers: number[];
}

export interface ILagrangianConstraintService {
  /** 计算拉格朗日函数 L(a,λ) */
  computeLagrangian(input: LagrangianInput, multipliers: number[]): LagrangianOutput;
  /** 对偶目标：给定 λ，返回 max_a L(a,λ) 的近似（当 a 固定时为 L(a,λ)） */
  dualObjective(utility: number, constraints: ConstraintValue[], multipliers: number[]): number;
}
