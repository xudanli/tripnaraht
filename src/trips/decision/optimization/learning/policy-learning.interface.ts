/**
 * Policy Learning Framework Interface
 *
 * 顶级强化方向 ①：决策策略函数 π 学习
 * π_θ(a|s) = argmax E[U(a|s)]
 *
 * 支持：Imitation Learning、RL、Offline Policy Learning
 * 参考：docs/Decision_OS_技术交底书.md 3.11.1
 */

import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

/** 策略输出（动作分布或最优动作） */
export interface PolicyOutput {
  /** 推荐动作 a* */
  recommendedAction: string;
  /** 动作概率分布 π_θ(a|s)（可选） */
  actionDistribution?: Record<string, number>;
  /** 期望效用 E[U(a|s)] */
  expectedUtility?: number;
}

/** 策略学习配置 */
export interface PolicyLearningConfig {
  /** 学习模式 */
  mode: 'imitation' | 'rl' | 'offline';
  /** 学习率 */
  learningRate?: number;
  /** 批量大小 */
  batchSize?: number;
}

/** 策略学习框架接口 */
export interface IPolicyLearningService {
  /**
   * 策略推断：π_θ(a|s) = argmax E[U(a|s)]
   */
  inferPolicy(state: DecisionState): Promise<PolicyOutput>;

  /**
   * 策略更新（从专家/奖励/轨迹学习）
   */
  updatePolicy?(
    state: DecisionState,
    action: string,
    rewardOrSignal: number | 'expert',
    config?: PolicyLearningConfig,
  ): Promise<void>;
}
