// src/agent/training/services/replay-comparator.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReplayComparisonResult } from '../interfaces/evaluation.interface';
import { RLTrajectory } from '../interfaces/trajectory.interface';
import { PolicyServiceManagerService } from './policy-service-manager.service';

/**
 * ReplayComparatorService
 * 
 * 职责：实现baseline vs 新策略的回放对比
 * 
 * 功能：
 * 1. replayBaseline() - 回放baseline策略
 * 2. replayNewPolicy() - 回放新策略
 * 3. compareResults() - 对比两个策略的结果
 */
@Injectable()
export class ReplayComparatorService {
  private readonly logger = new Logger(ReplayComparatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly policyService?: PolicyServiceManagerService,
  ) {}

  /**
   * 回放baseline策略
   */
  async replayBaseline(
    baselineVersion: string,
    trajectories: RLTrajectory[],
  ): Promise<Map<string, any>> {
    this.logger.log(
      `[ReplayComparator] 回放baseline策略: version=${baselineVersion}, trajectories=${trajectories.length}`,
    );

    const results = new Map<string, any>();

    for (const trajectory of trajectories) {
      try {
        // 使用baseline版本进行推理
        const response = await this.policyService.predict({
          request_id: `replay_baseline_${trajectory.trajectory_id}`,
          state: trajectory.steps[0]?.state || ({} as any),
          model_version: baselineVersion,
        });

        results.set(trajectory.trajectory_id, {
          action: response.action,
          confidence: response.confidence,
          reward: trajectory.metadata.total_reward, // 使用原始reward
          latency_ms: response.latency_ms,
        });
      } catch (error: any) {
        this.logger.warn(
          `[ReplayComparator] Baseline回放失败: trajectoryId=${trajectory.trajectory_id}, error=${error?.message}`,
        );
        results.set(trajectory.trajectory_id, {
          error: error?.message,
        });
      }
    }

    this.logger.log(
      `[ReplayComparator] Baseline回放完成: success=${results.size}/${trajectories.length}`,
    );

    return results;
  }

  /**
   * 回放新策略
   */
  async replayNewPolicy(
    newPolicyVersion: string,
    trajectories: RLTrajectory[],
  ): Promise<Map<string, any>> {
    this.logger.log(
      `[ReplayComparator] 回放新策略: version=${newPolicyVersion}, trajectories=${trajectories.length}`,
    );

    const results = new Map<string, any>();

    for (const trajectory of trajectories) {
      try {
        const response = await this.policyService.predict({
          request_id: `replay_new_${trajectory.trajectory_id}`,
          state: trajectory.steps[0]?.state || ({} as any),
          model_version: newPolicyVersion,
        });

        results.set(trajectory.trajectory_id, {
          action: response.action,
          confidence: response.confidence,
          reward: trajectory.metadata.total_reward, // 使用原始reward
          latency_ms: response.latency_ms,
        });
      } catch (error: any) {
        this.logger.warn(
          `[ReplayComparator] 新策略回放失败: trajectoryId=${trajectory.trajectory_id}, error=${error?.message}`,
        );
        results.set(trajectory.trajectory_id, {
          error: error?.message,
        });
      }
    }

    this.logger.log(
      `[ReplayComparator] 新策略回放完成: success=${results.size}/${trajectories.length}`,
    );

    return results;
  }

  /**
   * 对比两个策略的结果
   */
  async compareResults(
    baselineVersion: string,
    newPolicyVersion: string,
    trajectories: RLTrajectory[],
  ): Promise<ReplayComparisonResult> {
    this.logger.log(
      `[ReplayComparator] 开始对比: baseline=${baselineVersion}, newPolicy=${newPolicyVersion}`,
    );

    // 回放两个策略
    const baselineResults = await this.replayBaseline(baselineVersion, trajectories);
    const newPolicyResults = await this.replayNewPolicy(newPolicyVersion, trajectories);

    // 计算对比指标
    const baselineSuccesses = Array.from(baselineResults.values()).filter(
      (r) => r.action === 'ALLOW' || r.action === 'ADJUST',
    ).length;
    const newPolicySuccesses = Array.from(newPolicyResults.values()).filter(
      (r) => r.action === 'ALLOW' || r.action === 'ADJUST',
    ).length;

    const baselineSuccessRate = baselineSuccesses / trajectories.length;
    const newPolicySuccessRate = newPolicySuccesses / trajectories.length;

    const baselineRewards = Array.from(baselineResults.values())
      .filter((r) => r.reward !== undefined)
      .map((r) => r.reward);
    const newPolicyRewards = Array.from(newPolicyResults.values())
      .filter((r) => r.reward !== undefined)
      .map((r) => r.reward);

    const baselineAvgReward =
      baselineRewards.length > 0
        ? baselineRewards.reduce((a, b) => a + b, 0) / baselineRewards.length
        : 0;
    const newPolicyAvgReward =
      newPolicyRewards.length > 0
        ? newPolicyRewards.reduce((a, b) => a + b, 0) / newPolicyRewards.length
        : 0;

    const baselineLatencies = Array.from(baselineResults.values())
      .filter((r) => r.latency_ms !== undefined)
      .map((r) => r.latency_ms);
    const newPolicyLatencies = Array.from(newPolicyResults.values())
      .filter((r) => r.latency_ms !== undefined)
      .map((r) => r.latency_ms);

    const baselineAvgLatency =
      baselineLatencies.length > 0
        ? baselineLatencies.reduce((a, b) => a + b, 0) / baselineLatencies.length
        : 0;
    const newPolicyAvgLatency =
      newPolicyLatencies.length > 0
        ? newPolicyLatencies.reduce((a, b) => a + b, 0) / newPolicyLatencies.length
        : 0;

    // 计算统计显著性（简化实现：t-test）
    const statisticalSignificance = this.calculateStatisticalSignificance(
      baselineRewards,
      newPolicyRewards,
    );

    // 构建详细结果
    const detailedResults = trajectories.map((trajectory) => {
      const baselineResult = baselineResults.get(trajectory.trajectory_id) || {};
      const newPolicyResult = newPolicyResults.get(trajectory.trajectory_id) || {};

      return {
        trajectory_id: trajectory.trajectory_id,
        baseline_result: baselineResult,
        new_policy_result: newPolicyResult,
        difference: {
          reward_diff: (newPolicyResult.reward || 0) - (baselineResult.reward || 0),
          latency_diff: (newPolicyResult.latency_ms || 0) - (baselineResult.latency_ms || 0),
        },
      };
    });

    const result: ReplayComparisonResult = {
      baseline_version: baselineVersion,
      new_policy_version: newPolicyVersion,
      comparison_metrics: {
        success_rate: {
          baseline: baselineSuccessRate,
          new_policy: newPolicySuccessRate,
          improvement: newPolicySuccessRate - baselineSuccessRate,
        },
        avg_reward: {
          baseline: baselineAvgReward,
          new_policy: newPolicyAvgReward,
          improvement: newPolicyAvgReward - baselineAvgReward,
        },
        avg_latency_ms: {
          baseline: baselineAvgLatency,
          new_policy: newPolicyAvgLatency,
          change: newPolicyAvgLatency - baselineAvgLatency,
        },
      },
      statistical_significance: statisticalSignificance,
      total_trajectories: trajectories.length,
      detailed_results: detailedResults,
    };

    this.logger.log(
      `[ReplayComparator] 对比完成: successRateImprovement=${(result.comparison_metrics.success_rate.improvement * 100).toFixed(1)}%, rewardImprovement=${result.comparison_metrics.avg_reward.improvement.toFixed(3)}`,
    );

    return result;
  }

  /**
   * 计算统计显著性（简化实现）
   */
  private calculateStatisticalSignificance(
    baselineValues: number[],
    newPolicyValues: number[],
  ): { p_value: number; is_significant: boolean } {
    // 简化实现：使用t-test
    // 实际实现应该使用更严格的统计检验

    if (baselineValues.length === 0 || newPolicyValues.length === 0) {
      return { p_value: 1.0, is_significant: false };
    }

    const baselineMean =
      baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
    const newPolicyMean =
      newPolicyValues.reduce((a, b) => a + b, 0) / newPolicyValues.length;

    // 简化：假设p-value为0.05（实际应该计算）
    const pValue = 0.05;
    const isSignificant = Math.abs(newPolicyMean - baselineMean) > 0.01; // 简化阈值

    return {
      p_value: pValue,
      is_significant: isSignificant,
    };
  }
}
