/**
 * 可微决策架构接口
 *
 * 顶级强化方向 ③：可微决策
 * z = f_θ(DSO), ∇_θ U → 端到端可训练决策系统
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.11.3
 */

import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

/** DSO 紧凑表示（嵌入向量） */
export interface DSOEmbedding {
  /** 嵌入向量 z */
  z: number[];
  /** 嵌入维度 */
  dim: number;
}

export interface IDifferentiableDecisionService {
  /**
   * 将 DSO 编码为紧凑表示 z = f_θ(DSO)
   */
  encodeDSO(dso: DecisionState): DSOEmbedding;

  /**
   * 计算效用 U(z)
   */
  computeUtility(z: number[]): number;

  /**
   * 计算梯度 ∇_z U（用于端到端训练）
   * 骨架实现，返回数值梯度近似
   */
  computeGradient(z: number[]): number[];
}
