/**
 * 多步规划服务
 *
 * 顶级强化方向 ②：MPC + Planning
 * max E[ Σ_{t=0}^{H} γ^t R(s_t, a_t) ]  subject to  g_i(s_t,a_t) ≤ 0
 *
 * 通过世界模型 predictOutcome 链式调用实现 Look-ahead 决策
 * 参考：docs/Decision_OS_技术交底书.md 3.11.2
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  IMultiStepPlanningService,
  MultiStepPlanningConfig,
  MultiStepPlanningResult,
  StepResult,
} from './multi-step-planning.interface';
import type { ConstraintValue } from '../theory/lagrangian-constraint.interface';
import { ProbabilisticWorldModelService } from '../probabilistic/probabilistic-world-model.service';
import type {
  DecisionAction,
  ProbabilisticWorldModelContext,
} from '../probabilistic/probabilistic-world-model.interface';

const DEFAULT_CONFIG: MultiStepPlanningConfig = {
  horizon: 3,
  discountFactor: 0.95,
  candidatesPerStep: 5,
};

@Injectable()
export class MultiStepPlanningService implements IMultiStepPlanningService {
  private readonly logger = new Logger(MultiStepPlanningService.name);

  constructor(private readonly worldModel: ProbabilisticWorldModelService) {}

  /**
   * 评估动作序列的折扣回报
   * E[ Σ γ^t R(s_t,a_t) ]
   */
  async evaluateRollout(
    initialContext: ProbabilisticWorldModelContext,
    actionSequence: DecisionAction[],
    config?: Partial<MultiStepPlanningConfig>,
  ): Promise<MultiStepPlanningResult> {
    const { horizon, discountFactor } = { ...DEFAULT_CONFIG, ...config };
    const steps: StepResult[] = [];
    let totalDiscountedReturn = 0;
    let allFeasible = true;

    let context = initialContext;
    const effectiveHorizon = Math.min(horizon, actionSequence.length);

    for (let t = 0; t < effectiveHorizon; t++) {
      const action = actionSequence[t];
      const pred = this.worldModel.predictOutcome(context, action);

      const reward = pred.estimatedUtility;
      const discountedReward = Math.pow(discountFactor, t) * reward;
      totalDiscountedReturn += discountedReward;

      if (pred.feasibilityProbability < 0.5) {
        allFeasible = false;
      }

      steps.push({
        t,
        action,
        reward,
        discountedReward,
        feasibilityProbability: pred.feasibilityProbability,
      });

      context = pred.nextState;
    }

    this.logger.debug(
      `[MultiStepPlanning] evaluateRollout: H=${effectiveHorizon}, return=${totalDiscountedReturn.toFixed(4)}`,
    );

    return {
      totalDiscountedReturn,
      steps,
      allFeasible,
    };
  }

  /**
   * 规划最优下一步动作
   * 对每个候选动作做 horizon 步 rollout（后续步用默认动作），取期望回报最大者
   */
  async planBestNextAction(
    initialContext: ProbabilisticWorldModelContext,
    candidateActions: DecisionAction[],
    config?: Partial<MultiStepPlanningConfig>,
  ): Promise<{ bestAction: DecisionAction; expectedReturn: number }> {
    const { horizon, discountFactor: _discountFactor } = { ...DEFAULT_CONFIG, ...config };

    let bestAction = candidateActions[0];
    let bestReturn = -Infinity;

    for (const action of candidateActions) {
      // 构建动作序列：第一步为当前候选，后续为默认 NOOP
      const sequence: DecisionAction[] = [
        action,
        ...Array(horizon - 1).fill({ type: 'NOOP', payload: {} }),
      ];

      const result = await this.evaluateRollout(initialContext, sequence, config);

      if (result.totalDiscountedReturn > bestReturn) {
        bestReturn = result.totalDiscountedReturn;
        bestAction = action;
      }
    }

    this.logger.debug(
      `[MultiStepPlanning] planBestNextAction: best=${bestAction.type}, return=${bestReturn.toFixed(4)}`,
    );

    return { bestAction, expectedReturn: bestReturn };
  }

  /**
   * 专利 3.13.6：Bellman 备份 V(s,a) = R(s,a) + γ E[V(s')] s.t. g_i≤0
   * 约束形式：当 constraintFeasible 且违反约束时 value 置为 -∞
   */
  async computeBellmanBackup(
    context: ProbabilisticWorldModelContext,
    action: DecisionAction,
    config?: Partial<MultiStepPlanningConfig>,
  ): Promise<{
    value: number;
    reward: number;
    discountedContinuation: number;
    constraintViolations?: ConstraintValue[];
  }> {
    const { discountFactor, constraintFeasible, constraintViolations } = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    const pred = this.worldModel.predictOutcome(context, action);
    const reward = pred.estimatedUtility;
    const continuation = pred.nextState;
    const noopSequence = Array(DEFAULT_CONFIG.horizon - 1).fill({ type: 'NOOP', payload: {} });
    const rest = await this.evaluateRollout(continuation, noopSequence, config);

    const hasViolation =
      constraintFeasible &&
      (pred.feasibilityProbability < 0.5 ||
        (constraintViolations?.some((c) => c.value > 0) ?? false));

    const discountedContinuation = hasViolation ? 0 : discountFactor * rest.totalDiscountedReturn;
    const value = hasViolation ? -Infinity : reward + discountedContinuation;

    return {
      value,
      reward,
      discountedContinuation,
      ...(constraintViolations?.length ? { constraintViolations } : {}),
    };
  }
}
