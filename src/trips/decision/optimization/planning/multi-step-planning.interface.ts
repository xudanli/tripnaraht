/**
 * 多步规划接口
 *
 * 顶级强化方向 ②：MPC + Planning
 * max E[ Σ_{t=0}^{H} γ^t R(s_t, a_t) ]  subject to  g_i(s_t,a_t) ≤ 0
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.11.2
 */

import type { DecisionAction } from '../probabilistic/probabilistic-world-model.interface';
import type { ProbabilisticWorldModelContext } from '../probabilistic/probabilistic-world-model.interface';
import type { ConstraintValue } from '../theory/lagrangian-constraint.interface';

/** 多步规划配置 */
export interface MultiStepPlanningConfig {
  /** 规划视野 H */
  horizon: number;
  /** 折扣因子 γ */
  discountFactor: number;
  /** 每步候选动作数（用于搜索） */
  candidatesPerStep?: number;
  /** 是否启用约束可行性检查（违反时 value 置为 -∞） */
  constraintFeasible?: boolean;
  /** 约束违反值（g_i > 0 表示违反） */
  constraintViolations?: ConstraintValue[];
}

/** 单步规划结果 */
export interface StepResult {
  t: number;
  action: DecisionAction;
  reward: number;
  discountedReward: number;
  feasibilityProbability: number;
}

/** 多步规划结果 */
export interface MultiStepPlanningResult {
  /** 总折扣回报 */
  totalDiscountedReturn: number;
  /** 各步结果 */
  steps: StepResult[];
  /** 是否所有步可行 */
  allFeasible: boolean;
}

export interface IMultiStepPlanningService {
  /**
   * 评估动作序列的折扣回报
   * E[ Σ γ^t R(s_t,a_t) ]
   */
  evaluateRollout(
    initialContext: ProbabilisticWorldModelContext,
    actionSequence: DecisionAction[],
    config?: Partial<MultiStepPlanningConfig>,
  ): Promise<MultiStepPlanningResult>;

  /**
   * 规划最优下一步动作（简化版：单步 lookahead 到 horizon）
   */
  planBestNextAction(
    initialContext: ProbabilisticWorldModelContext,
    candidateActions: DecisionAction[],
    config?: Partial<MultiStepPlanningConfig>,
  ): Promise<{ bestAction: DecisionAction; expectedReturn: number }>;

  /**
   * 专利 3.13.6：Bellman 最优性 V*(s) = max_a [R(s,a) + γ E[V*(s')]] s.t. g_i≤0
   * 单步 Bellman 备份：R + γ E[V(s')]，可选约束形式
   */
  computeBellmanBackup(
    context: ProbabilisticWorldModelContext,
    action: DecisionAction,
    config?: Partial<MultiStepPlanningConfig>,
  ): Promise<{
    value: number;
    reward: number;
    discountedContinuation: number;
    constraintViolations?: ConstraintValue[];
  }>;
}
