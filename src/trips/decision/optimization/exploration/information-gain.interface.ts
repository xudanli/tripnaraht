/**
 * 信息增益接口
 *
 * 专利 3.12.2：U'(a) = U(a) + β·InformationGain(a)
 * Exploration vs Exploitation，主动学习决策
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.12.2
 */

import type { WorldModelContext } from '../../shared/world-model.types';

/** 信息增益估计方式 */
export type InformationGainMethod =
  | 'ENTROPY_REDUCTION'
  | 'VARIANCE_REDUCTION'
  | 'PREDICTION_UNCERTAINTY'
  | 'KL_DIVERGENCE';

/** 信息增益计算输入 */
export interface InformationGainInput {
  /** 候选动作 a 的 ID */
  candidateId: string;
  /** 当前信念状态（或 uncertaintyProfile） */
  uncertaintyProfile?: { sources: string[]; overallLevel?: number };
  /** 世界模型上下文（用于预测） */
  worldContext: WorldModelContext;
  /** 可选：已有效用估计 U(a) */
  baseUtility?: number;
  /** 可选：Monte Carlo 置信区间，用于 VARIANCE_REDUCTION */
  confidenceInterval?: { lower: number; upper: number };
  /** 可选：效用样本（用于 ENTROPY_REDUCTION 熵估计） */
  utilitySamples?: number[];
  /** 可选：执行 a 后的信念样本（用于 IG=H(b)−E[H(b')]） */
  posteriorSamples?: number[];
}

/** 信息增益服务接口 */
export interface IInformationGainService {
  computeInformationGain(input: InformationGainInput, method?: InformationGainMethod): number;
}
