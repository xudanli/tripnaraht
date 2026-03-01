/**
 * 决策系统统一学习方程接口
 *
 * 专利 3.13.15：
 * π_{k+1} = argmax_π E[Σ γ^t R(s_t,a_t)]  subject to g_i ≤ 0
 * θ_{k+1} = θ_k − η ∇_θ L
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.15
 */

export interface UnifiedLearningInput {
  /** 当前策略参数 θ_k */
  theta?: Record<string, number>;
  /** 学习率 η */
  learningRate?: number;
  /** 梯度 ∇_θ L */
  gradient?: Record<string, number>;
}

export interface UnifiedLearningOutput {
  /** 更新后参数 θ_{k+1} */
  theta: Record<string, number>;
  /** 是否执行了更新 */
  updated: boolean;
}

export interface IUnifiedLearningService {
  /** 参数更新：θ_{k+1} = θ_k − η ∇_θ L */
  updateParameters(input: UnifiedLearningInput): UnifiedLearningOutput;
}
