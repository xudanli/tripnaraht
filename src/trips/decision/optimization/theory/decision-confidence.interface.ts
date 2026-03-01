/**
 * 决策置信度数学定义接口
 *
 * 专利 3.13.9：
 * Confidence(a) = 1 − Var(U(a)) / Var_max
 * Confidence(a) = P(U(a) ≥ τ)
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.9
 */

export type ConfidenceMethod = 'VARIANCE' | 'PROBABILITY';

export interface ConfidenceInput {
  /** 效用或效用样本 */
  utility?: number;
  /** 效用样本（用于方差估计） */
  utilitySamples?: number[];
  /** 效用方差（若已知） */
  variance?: number;
  /** 满意度阈值 τ（概率形式） */
  threshold?: number;
}

export interface IDecisionConfidenceService {
  /** 方差形式：Confidence = 1 − Var(U)/Var_max */
  computeConfidenceVariance(variance: number, varMax?: number): number;
  /** 概率形式：Confidence = P(U ≥ τ) */
  computeConfidenceProbability(samples: number[], threshold: number): number;
  /** 综合：根据输入选择方法 */
  computeConfidence(input: ConfidenceInput, method?: ConfidenceMethod): number;
}
