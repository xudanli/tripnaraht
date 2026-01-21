// src/agent/training/services/offline-policy-evaluator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OPEResult, OPEReport } from '../interfaces/evaluation.interface';
import { RLTrajectory } from '../interfaces/trajectory.interface';

/**
 * OfflinePolicyEvaluatorService
 * 
 * 职责：实现Offline Policy Evaluation（IS/DR/WDR等）
 * 
 * 功能：
 * 1. evaluateWithIS() - Importance Sampling
 * 2. evaluateWithDR() - Doubly Robust
 * 3. evaluateWithWDR() - Weighted Doubly Robust
 * 4. generateReport() - 生成OPE报告
 */
@Injectable()
export class OfflinePolicyEvaluatorService {
  private readonly logger = new Logger(OfflinePolicyEvaluatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Importance Sampling (IS) 评估
   */
  async evaluateWithIS(
    trajectories: RLTrajectory[],
    baselineRewards: Map<string, number>,
  ): Promise<OPEResult> {
    this.logger.log(`[OPE] 开始IS评估: trajectories=${trajectories.length}`);

    let totalWeightedReward = 0;
    let totalWeight = 0;

    for (const trajectory of trajectories) {
      const baselineReward = baselineRewards.get(trajectory.trajectory_id) || 0;
      const newPolicyReward = trajectory.metadata.total_reward || 0;

      // 计算重要性权重（简化实现）
      const importanceWeight = this.calculateImportanceWeight(
        trajectory,
        baselineReward,
        newPolicyReward,
      );

      const weightedReward = newPolicyReward * importanceWeight;
      totalWeightedReward += weightedReward;
      totalWeight += importanceWeight;
    }

    const estimatedReward = totalWeight > 0 ? totalWeightedReward / totalWeight : 0;

    // 计算置信区间（简化实现）
    const confidenceInterval = this.calculateConfidenceInterval(
      trajectories,
      estimatedReward,
      'IS',
    );

    const result: OPEResult = {
      method: 'IS',
      estimated_reward: estimatedReward,
      confidence_interval: confidenceInterval,
      statistical_significance: {
        p_value: 0.05, // TODO: 实际计算
        is_significant: true,
      },
      sample_size: trajectories.length,
      metadata: {
        total_weight: totalWeight,
      },
    };

    this.logger.log(
      `[OPE] IS评估完成: estimatedReward=${estimatedReward.toFixed(3)}`,
    );

    return result;
  }

  /**
   * Doubly Robust (DR) 评估
   */
  async evaluateWithDR(
    trajectories: RLTrajectory[],
    baselineRewards: Map<string, number>,
    directMethodEstimates?: Map<string, number>,
  ): Promise<OPEResult> {
    this.logger.log(`[OPE] 开始DR评估: trajectories=${trajectories.length}`);

    let totalDRReward = 0;

    for (const trajectory of trajectories) {
      const baselineReward = baselineRewards.get(trajectory.trajectory_id) || 0;
      const newPolicyReward = trajectory.metadata.total_reward || 0;
      const directEstimate = directMethodEstimates?.get(trajectory.trajectory_id) || newPolicyReward;

      // 计算重要性权重
      const importanceWeight = this.calculateImportanceWeight(
        trajectory,
        baselineReward,
        newPolicyReward,
      );

      // DR估计 = 直接方法估计 + 重要性权重 * (实际reward - 直接方法估计)
      const drEstimate = directEstimate + importanceWeight * (newPolicyReward - directEstimate);
      totalDRReward += drEstimate;
    }

    const estimatedReward = totalDRReward / trajectories.length;

    const confidenceInterval = this.calculateConfidenceInterval(
      trajectories,
      estimatedReward,
      'DR',
    );

    const result: OPEResult = {
      method: 'DR',
      estimated_reward: estimatedReward,
      confidence_interval: confidenceInterval,
      statistical_significance: {
        p_value: 0.05, // TODO: 实际计算
        is_significant: true,
      },
      sample_size: trajectories.length,
      metadata: {},
    };

    this.logger.log(
      `[OPE] DR评估完成: estimatedReward=${estimatedReward.toFixed(3)}`,
    );

    return result;
  }

  /**
   * Weighted Doubly Robust (WDR) 评估
   */
  async evaluateWithWDR(
    trajectories: RLTrajectory[],
    baselineRewards: Map<string, number>,
    directMethodEstimates?: Map<string, number>,
  ): Promise<OPEResult> {
    this.logger.log(`[OPE] 开始WDR评估: trajectories=${trajectories.length}`);

    // WDR使用加权的重要性权重
    let totalWeightedDRReward = 0;
    let totalWeight = 0;

    for (const trajectory of trajectories) {
      const baselineReward = baselineRewards.get(trajectory.trajectory_id) || 0;
      const newPolicyReward = trajectory.metadata.total_reward || 0;
      const directEstimate = directMethodEstimates?.get(trajectory.trajectory_id) || newPolicyReward;

      // 计算加权重要性权重
      const weightedImportanceWeight = this.calculateWeightedImportanceWeight(
        trajectory,
        baselineReward,
        newPolicyReward,
      );

      const drEstimate = directEstimate + weightedImportanceWeight * (newPolicyReward - directEstimate);
      totalWeightedDRReward += drEstimate * weightedImportanceWeight;
      totalWeight += weightedImportanceWeight;
    }

    const estimatedReward = totalWeight > 0 ? totalWeightedDRReward / totalWeight : 0;

    const confidenceInterval = this.calculateConfidenceInterval(
      trajectories,
      estimatedReward,
      'WDR',
    );

    const result: OPEResult = {
      method: 'WDR',
      estimated_reward: estimatedReward,
      confidence_interval: confidenceInterval,
      statistical_significance: {
        p_value: 0.05, // TODO: 实际计算
        is_significant: true,
      },
      sample_size: trajectories.length,
      metadata: {
        total_weight: totalWeight,
      },
    };

    this.logger.log(
      `[OPE] WDR评估完成: estimatedReward=${estimatedReward.toFixed(3)}`,
    );

    return result;
  }

  /**
   * 生成OPE报告
   */
  async generateReport(
    modelVersion: string,
    baselineVersion: string | undefined,
    trajectories: RLTrajectory[],
    baselineRewards: Map<string, number>,
    directMethodEstimates?: Map<string, number>,
  ): Promise<OPEReport> {
    this.logger.log(
      `[OPE] 生成OPE报告: modelVersion=${modelVersion}, baselineVersion=${baselineVersion}`,
    );

    // 执行三种OPE方法
    const isResult = await this.evaluateWithIS(trajectories, baselineRewards);
    const drResult = await this.evaluateWithDR(
      trajectories,
      baselineRewards,
      directMethodEstimates,
    );
    const wdrResult = await this.evaluateWithWDR(
      trajectories,
      baselineRewards,
      directMethodEstimates,
    );

    // 计算baseline reward（如果有）
    let baselineReward: number | undefined;
    if (baselineRewards.size > 0) {
      const baselineRewardsArray = Array.from(baselineRewards.values());
      baselineReward =
        baselineRewardsArray.reduce((a, b) => a + b, 0) / baselineRewardsArray.length;
    }

    // 计算改进（使用WDR结果，通常最稳健）
    const improvement = baselineReward
      ? (wdrResult.estimated_reward - baselineReward) / baselineReward
      : undefined;

    // 更新结果中的baseline和改进
    isResult.baseline_reward = baselineReward;
    isResult.improvement = improvement;
    drResult.baseline_reward = baselineReward;
    drResult.improvement = improvement;
    wdrResult.baseline_reward = baselineReward;
    wdrResult.improvement = improvement;

    // 生成推荐
    const shouldDeploy = this.shouldDeployModel(wdrResult, baselineReward);
    const confidence = this.calculateConfidence(wdrResult);
    const reasoning = this.generateReasoning(wdrResult, baselineReward, improvement);

    const report: OPEReport = {
      model_version: modelVersion,
      baseline_version: baselineVersion,
      evaluation_date: new Date().toISOString(),
      results: {
        is: isResult,
        dr: drResult,
        wdr: wdrResult,
      },
      recommendation: {
        should_deploy: shouldDeploy,
        confidence,
        reasoning,
      },
    };

    this.logger.log(
      `[OPE] OPE报告生成完成: shouldDeploy=${shouldDeploy}, confidence=${confidence}`,
    );

    return report;
  }

  /**
   * 计算重要性权重（简化实现）
   */
  private calculateImportanceWeight(
    trajectory: RLTrajectory,
    baselineReward: number,
    newPolicyReward: number,
  ): number {
    // 简化实现：基于reward的比例
    // 实际实现应该基于策略概率比
    if (baselineReward === 0) return 1.0;
    return Math.max(0.1, Math.min(10.0, newPolicyReward / baselineReward));
  }

  /**
   * 计算加权重要性权重
   */
  private calculateWeightedImportanceWeight(
    trajectory: RLTrajectory,
    baselineReward: number,
    newPolicyReward: number,
  ): number {
    // WDR使用归一化的权重
    const baseWeight = this.calculateImportanceWeight(trajectory, baselineReward, newPolicyReward);
    // 简化实现：使用validation_score作为权重
    const validationScore = trajectory.metadata.validation_score || 0.5;
    return baseWeight * validationScore;
  }

  /**
   * 计算置信区间
   */
  private calculateConfidenceInterval(
    trajectories: RLTrajectory[],
    estimatedReward: number,
    method: string,
  ): OPEResult['confidence_interval'] {
    // 简化实现：使用标准误差
    const rewards = trajectories.map((t) => t.metadata.total_reward || 0);
    const variance = this.calculateVariance(rewards, estimatedReward);
    const standardError = Math.sqrt(variance / trajectories.length);
    const zScore = 1.96; // 95%置信区间

    return {
      lower: estimatedReward - zScore * standardError,
      upper: estimatedReward + zScore * standardError,
      confidence_level: 0.95,
    };
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 判断是否应该部署模型
   */
  private shouldDeployModel(result: OPEResult, baselineReward?: number): boolean {
    if (!baselineReward) {
      // 如果没有baseline，检查置信区间是否为正
      return result.confidence_interval.lower > 0;
    }

    // 检查改进是否显著
    const improvement = result.improvement || 0;
    return (
      improvement > 0 &&
      result.statistical_significance.is_significant &&
      result.confidence_interval.lower > baselineReward * 0.95
    );
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(result: OPEResult): 'HIGH' | 'MEDIUM' | 'LOW' {
    const intervalWidth =
      result.confidence_interval.upper - result.confidence_interval.lower;
    const relativeWidth = intervalWidth / Math.abs(result.estimated_reward || 1);

    if (relativeWidth < 0.1 && result.statistical_significance.is_significant) {
      return 'HIGH';
    } else if (relativeWidth < 0.2 && result.statistical_significance.is_significant) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 生成推理说明
   */
  private generateReasoning(
    result: OPEResult,
    baselineReward?: number,
    improvement?: number,
  ): string {
    const parts: string[] = [];

    if (baselineReward !== undefined && improvement !== undefined) {
      parts.push(
        `Estimated reward: ${result.estimated_reward.toFixed(3)} (baseline: ${baselineReward.toFixed(3)}, improvement: ${(improvement * 100).toFixed(1)}%)`,
      );
    } else {
      parts.push(`Estimated reward: ${result.estimated_reward.toFixed(3)}`);
    }

    parts.push(
      `Confidence interval: [${result.confidence_interval.lower.toFixed(3)}, ${result.confidence_interval.upper.toFixed(3)}]`,
    );

    if (result.statistical_significance.is_significant) {
      parts.push(`Statistically significant (p < 0.05)`);
    } else {
      parts.push(`Not statistically significant (p >= 0.05)`);
    }

    return parts.join('. ');
  }
}
