/**
 * Policy Learning Service
 *
 * 顶级强化方向 ①：决策策略函数 π 学习
 * π_θ(a|s) = argmax E[U(a|s)]
 *
 * 支持：Imitation Learning、RL、Offline Policy Learning
 * 参考：docs/Decision_OS_技术交底书.md 3.11.1
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import {
  IPolicyLearningService,
  PolicyOutput,
  PolicyLearningConfig,
} from './policy-learning.interface';
import { OptimizationEngineAdapterService } from '../../../../decision/kernel/optimization-engine-adapter.service';
import { WeightLearnerService } from './weight-learner.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import { dsoToMinimalWorldModelContext } from '../../../../decision/kernel/dso-to-world-model-converter';
import { itineraryToRoutePlanDraft } from '../../../../decision/kernel/dso-to-trips-converter';
import { CGUSSearchService, CGUSCandidate } from '../cgus-search.service';
import { MetaPolicyService } from '../meta/meta-policy.service';
import type { Itinerary } from '../../../../agent/interfaces/trip-plan.interface';
import type { RoutePlanDraft } from '../../shared/world-model.types';

@Injectable()
export class PolicyLearningService implements IPolicyLearningService {
  private readonly logger = new Logger(PolicyLearningService.name);

  constructor(
    @Optional() private readonly optimizationAdapter?: OptimizationEngineAdapterService,
    @Optional() private readonly cgusSearch?: CGUSSearchService,
    @Optional() private readonly weightLearner?: WeightLearnerService,
    @Optional() private readonly metaPolicy?: MetaPolicyService,
  ) {}

  /**
   * 策略推断：π_θ(a|s) = argmax E[U(a|s)]
   * 通过 OptimizationAdapter 或 CGUS 获取推荐动作与期望效用
   */
  async inferPolicy(state: DecisionState): Promise<PolicyOutput> {
    const hints = this.optimizationAdapter
      ? await this.optimizationAdapter.getHintsAsync(state).catch(() => this.optimizationAdapter!.getHints(state))
      : undefined;

    const expectedUtility = hints?.expectedUtility ?? hints?.feasibilityProbability ?? 0.7;
    const strategy = state.decisionMeta?.strategy ?? 'BALANCED';

    const actionDistribution: Record<string, number> = {
      CONSERVATIVE: strategy === 'CONSERVATIVE' ? 0.7 : 0.15,
      BALANCED: strategy === 'BALANCED' ? 0.7 : 0.15,
      AGGRESSIVE: strategy === 'AGGRESSIVE' ? 0.7 : 0.15,
    };

    const recommendedAction = await this.inferFromCGUS(state).catch(() => strategy);

    return {
      recommendedAction,
      actionDistribution,
      expectedUtility,
    };
  }

  private async inferFromCGUS(state: DecisionState): Promise<string> {
    if (!this.cgusSearch) return state.decisionMeta?.strategy ?? 'BALANCED';

    const worldContext = dsoToMinimalWorldModelContext(state);
    if (!worldContext) return state.decisionMeta?.strategy ?? 'BALANCED';

    const candidates = this.buildCandidatesFromState(state);
    if (candidates.length === 0) return state.decisionMeta?.strategy ?? 'BALANCED';

    // 专利 3.12.3：元决策 MetaPolicy 选择 N、Exploration 等
    const policyConfig = this.metaPolicy?.selectPolicy(state);

    const result = await this.cgusSearch.search(candidates, worldContext, {
      useMonteCarlo: false,
      useUtilityPrior: true,
      sampleSize: policyConfig?.sampleSize,
      useWorldModelRollout: policyConfig?.useWorldModelRollout,
      explorationBeta: policyConfig?.useExploration ? policyConfig.explorationBeta : 0,
    });

    const top = result.rankedCandidates[0];
    return top ? `PLAN_${top.candidate.id}` : state.decisionMeta?.strategy ?? 'BALANCED';
  }

  private buildCandidatesFromState(state: DecisionState): CGUSCandidate[] {
    const planDraft = state.tripState?.planDraft as Itinerary | undefined;
    if (!planDraft?.days?.length) return [];

    const env = state.environmentState ?? {};
    const routeDirectionId = env.routeDirectionId ?? 'unknown';
    const tripId = state.systemState?.requestId ?? state.requestId ?? 'unknown';
    const plan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId);

    return [
      {
        id: 'current',
        plan,
        constraintViolations: state.constraints?.violations?.map((v) => ({
          type: v.type,
          severity: v.severity,
          degree: v.degree ?? (v.severity === 'HARD' ? 1 : 0.5),
        })) ?? [],
        feasible: state.constraints?.feasible ?? true,
      },
    ];
  }

  /**
   * 策略更新：从专家/奖励/轨迹学习
   * 委托 WeightLearnerService 或记录学习信号
   */
  async updatePolicy(
    state: DecisionState,
    action: string,
    rewardOrSignal: number | 'expert',
    config?: PolicyLearningConfig,
  ): Promise<void> {
    if (!this.weightLearner) {
      this.logger.debug(`[PolicyLearning] updatePolicy 跳过：WeightLearner 未注入`);
      return;
    }

    const reward = rewardOrSignal === 'expert' ? 1 : rewardOrSignal;
    const mode = config?.mode ?? 'rl';

    if (mode === 'imitation' && rewardOrSignal === 'expert') {
      this.logger.debug(`[PolicyLearning] Imitation: 记录专家动作 ${action}`);
    } else if (mode === 'rl') {
      this.logger.debug(`[PolicyLearning] RL: 动作 ${action} 奖励 ${reward}`);
    } else if (mode === 'offline') {
      this.logger.debug(`[PolicyLearning] Offline: 记录轨迹 (${action}, ${reward})`);
    }

    const userId = (state as any).userId ?? 'system';
    this.weightLearner.recordFeedback({
      id: `policy_${Date.now()}`,
      userId,
      tripId: state.systemState?.requestId ?? state.requestId ?? 'unknown',
      type: 'SATISFACTION_RATING',
      timestamp: new Date().toISOString(),
      data: { overallSatisfaction: Math.max(1, Math.min(5, reward * 5)) },
      weightsAtTime: this.weightLearner.getUserWeights(userId),
      utilityAtTime: typeof reward === 'number' ? reward : 1,
    });
  }
}
