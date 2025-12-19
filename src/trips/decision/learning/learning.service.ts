// src/trips/decision/learning/learning.service.ts

/**
 * 学习机制服务
 * 
 * 从 Decision Log 中学习，优化策略参数
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionRunLog } from '../decision-log';
import { PolicyProfile } from '../config/objective-config';

export interface LearningMetrics {
  // 用户采纳率
  adoptionRate: number; // 0~1
  // 计划稳定性
  stabilityScore: number; // 0~1
  // 可执行率
  executabilityRate: number; // 0~1
  // 用户满意度（如果有反馈）
  satisfactionScore?: number; // 0~1
}

export interface LearningResult {
  policyAdjustments: Partial<PolicyProfile>;
  confidence: number; // 0~1, 调整的置信度
  sampleSize: number; // 样本数量
  recommendations: string[];
}

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  /**
   * 从决策日志中学习
   */
  learnFromLogs(
    logs: DecisionRunLog[],
    userFeedback?: Array<{
      logId: string;
      accepted: boolean;
      satisfaction?: number; // 0~1
    }>
  ): LearningResult {
    if (logs.length === 0) {
      return {
        policyAdjustments: {},
        confidence: 0,
        sampleSize: 0,
        recommendations: ['需要更多数据才能学习'],
      };
    }

    // 计算指标
    const metrics = this.calculateMetrics(logs, userFeedback);

    // 分析模式
    const patterns = this.analyzePatterns(logs, metrics);

    // 生成调整建议
    const adjustments = this.generateAdjustments(patterns, metrics);

    // 计算置信度
    const confidence = this.calculateConfidence(logs.length, metrics);

    // 生成建议
    const recommendations = this.generateRecommendations(patterns, metrics);

    return {
      policyAdjustments: adjustments,
      confidence,
      sampleSize: logs.length,
      recommendations,
    };
  }

  /**
   * 计算学习指标
   */
  private calculateMetrics(
    logs: DecisionRunLog[],
    userFeedback?: Array<{
      logId: string;
      accepted: boolean;
      satisfaction?: number;
    }>
  ): LearningMetrics {
    const feedbackMap = new Map(
      userFeedback?.map(f => [f.logId, f]) || []
    );

    let adoptedCount = 0;
    let totalStability = 0;
    let totalExecutability = 0;
    let totalSatisfaction = 0;
    let satisfactionCount = 0;

    for (const log of logs) {
      const feedback = feedbackMap.get(log.runId);

      // 采纳率：如果用户没有拒绝，视为采纳
      if (!feedback || feedback.accepted) {
        adoptedCount++;
      }

      // 稳定性：从 diff 计算
      if (log.diff) {
        const stability = 1 - log.diff.editDistanceScore / 100;
        totalStability += Math.max(0, Math.min(1, stability));
      }

      // 可执行率：从 violations 计算
      const violationCount = log.violations?.length || 0;
      const executability = violationCount === 0 ? 1.0 : 0.0;
      totalExecutability += executability;

      // 满意度
      if (feedback?.satisfaction !== undefined) {
        totalSatisfaction += feedback.satisfaction;
        satisfactionCount++;
      }
    }

    const sampleSize = logs.length;

    return {
      adoptionRate: sampleSize > 0 ? adoptedCount / sampleSize : 0,
      stabilityScore:
        sampleSize > 0 ? totalStability / sampleSize : 0,
      executabilityRate:
        sampleSize > 0 ? totalExecutability / sampleSize : 0,
      satisfactionScore:
        satisfactionCount > 0
          ? totalSatisfaction / satisfactionCount
          : undefined,
    };
  }

  /**
   * 分析模式
   */
  private analyzePatterns(
    logs: DecisionRunLog[],
    metrics: LearningMetrics
  ): Record<string, any> {
    const patterns: Record<string, any> = {};

    // 分析触发原因
    const triggerCounts: Record<string, number> = {};
    for (const log of logs) {
      triggerCounts[log.trigger] = (triggerCounts[log.trigger] || 0) + 1;
    }
    patterns.commonTriggers = Object.entries(triggerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([trigger]) => trigger);

    // 分析策略组合
    const strategyCounts: Record<string, number> = {};
    for (const log of logs) {
      for (const strategy of log.strategyMix || []) {
        strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      }
    }
    patterns.commonStrategies = Object.entries(strategyCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([strategy]) => strategy);

    // 分析常见违规
    const violationCounts: Record<string, number> = {};
    for (const log of logs) {
      for (const violation of log.violations || []) {
        violationCounts[violation.code] =
          (violationCounts[violation.code] || 0) + 1;
      }
    }
    patterns.commonViolations = Object.entries(violationCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([code]) => code);

    return patterns;
  }

  /**
   * 生成调整建议
   */
  private generateAdjustments(
    patterns: Record<string, any>,
    metrics: LearningMetrics
  ): Partial<PolicyProfile> {
    const adjustments: Partial<PolicyProfile> = {};

    // 如果可执行率低，增加 violationRisk 权重
    if (metrics.executabilityRate < 0.8) {
      adjustments.objectiveWeights = {
        satisfaction: 1.0,
        violationRisk: 1.5, // 增加
        robustness: 1.0,
        cost: 1.0,
      };
    }

    // 如果稳定性低，增加 robustness 权重
    if (metrics.stabilityScore < 0.7) {
      if (!adjustments.objectiveWeights) {
        adjustments.objectiveWeights = {
          satisfaction: 1.0,
          violationRisk: 1.0,
          robustness: 1.3, // 增加
          cost: 1.0,
        };
      } else {
        adjustments.objectiveWeights.robustness = 1.3;
      }
    }

    // 如果采纳率低，可能需要调整策略
    if (metrics.adoptionRate < 0.6) {
      // 这里可以根据 patterns 调整策略参数
      this.logger.warn(
        `Low adoption rate: ${metrics.adoptionRate}, consider strategy adjustment`
      );
    }

    return adjustments;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    sampleSize: number,
    metrics: LearningMetrics
  ): number {
    // 样本数量影响置信度
    const sizeConfidence = Math.min(1.0, sampleSize / 100);

    // 指标一致性影响置信度
    const consistency =
      (metrics.adoptionRate +
        metrics.stabilityScore +
        metrics.executabilityRate) /
      3;

    return (sizeConfidence * 0.6 + consistency * 0.4);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    patterns: Record<string, any>,
    metrics: LearningMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.executabilityRate < 0.8) {
      recommendations.push(
        '建议增加约束校验的严格程度，提高计划可执行性'
      );
    }

    if (metrics.stabilityScore < 0.7) {
      recommendations.push(
        '建议增加计划稳定性权重，减少频繁调整'
      );
    }

    if (patterns.commonViolations && patterns.commonViolations.length > 0) {
      recommendations.push(
        `常见问题：${patterns.commonViolations.join('、')}，建议优化相关策略`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('当前策略表现良好，无需调整');
    }

    return recommendations;
  }
}

