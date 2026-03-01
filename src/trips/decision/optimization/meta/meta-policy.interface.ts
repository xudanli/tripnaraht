/**
 * 元决策接口
 *
 * 专利 3.12.3：MetaPolicy 选择规划深度 H、采样预算 N、优化策略
 * 系统能够决定如何进行决策
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.12.3
 */

import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

/** 优化策略类型 */
export type OptimizationStrategy = 'CGUS' | 'MPC' | 'HYBRID';

/** 资源约束（输入） */
export interface ResourceConstraints {
  /** 最大延迟预算（ms） */
  latencyBudgetMs?: number;
  /** 最大计算预算（如采样总次数） */
  computeBudget?: number;
  /** 是否低功耗模式 */
  lowPowerMode?: boolean;
}

/** 边际分析（专利 4.14.6：MarginalUtility = MarginalCost） */
export interface MarginalAnalysis {
  /** ∂U/∂N 边际效用（增加单位 N 的效用增量） */
  dU_dN: number;
  /** ∂Cost/∂N 边际成本 */
  dCost_dN: number;
  /** ∂U/∂H 边际效用（增加单位 H 的效用增量） */
  dU_dH?: number;
  /** ∂Cost/∂H 边际成本 */
  dCost_dH?: number;
}

/** 元策略输出 */
export interface MetaPolicyOutput {
  /** 规划深度 H（多步规划 horizon） */
  horizon: number;
  /** 采样预算 N（Monte Carlo sampleSize） */
  sampleSize: number;
  /** 优化策略 */
  strategy: OptimizationStrategy;
  /** 是否使用世界模型推演 */
  useWorldModelRollout: boolean;
  /** 是否使用 Exploration（信息增益） */
  useExploration: boolean;
  /** Exploration 系数 β */
  explorationBeta: number;
  /** 边际分析（selectPolicyWithMarginalAnalysis 输出） */
  marginalAnalysis?: MarginalAnalysis;
}

/** 元策略候选（用于成本感知选择） */
export interface MetaPolicyCandidate {
  horizon: number;
  sampleSize: number;
  strategy: OptimizationStrategy;
  /** 估计效用 E[U] */
  estimatedUtility?: number;
  /** 估计成本 Cost(M) */
  estimatedCost?: number;
}

/** 元策略服务接口 */
export interface IMetaPolicyService {
  selectPolicy(dso: DecisionState, constraints?: ResourceConstraints): MetaPolicyOutput;
  /** 专利 3.13.13：M* = argmax E[U] − α·Cost(M) 成本感知选择 */
  selectPolicyWithCost(
    dso: DecisionState,
    options?: { alpha?: number; candidates?: MetaPolicyCandidate[] },
  ): MetaPolicyOutput;
  /** 专利 4.14.6：边际分析，当 MarginalUtility ≈ MarginalCost 时停止增加 N/H */
  selectPolicyWithMarginalAnalysis(
    dso: DecisionState,
    options?: { alpha?: number; maxIter?: number },
  ): MetaPolicyOutput & { marginalAnalysis?: MarginalAnalysis };
}
