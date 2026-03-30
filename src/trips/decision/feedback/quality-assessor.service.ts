// src/trips/decision/feedback/quality-assessor.service.ts

/**
 * Quality Assessor Service
 * 
 * 决策质量评估服务
 * 评估决策质量，包括计划质量、冲突解释质量、权衡选项质量等
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionRunLog } from '../decision-log';
import { ConstraintConflict } from '../constraints/constraint-dsl.types';
import { TripPlan } from '../plan-model';
import {
  PlanVariantFeedback,
  ConflictFeedback,
  DecisionQualityFeedback,
} from './feedback-collector.service';

/**
 * 决策质量指标
 */
export interface DecisionQualityMetrics {
  /** 计划质量分数（0-1） */
  planQualityScore: number;
  /** 冲突解释质量分数（0-1） */
  conflictExplanationQualityScore: number;
  /** 权衡选项质量分数（0-1） */
  tradeoffOptionsQualityScore: number;
  /** 决策速度分数（0-1） */
  decisionSpeedScore: number;
  /** 用户满意度分数（0-1） */
  userSatisfactionScore: number;
  /** 整体质量分数（0-1） */
  overallQualityScore: number;
}

/**
 * 质量评估结果
 */
export interface QualityAssessmentResult {
  /** 质量指标 */
  metrics: DecisionQualityMetrics;
  /** 质量等级 */
  qualityGrade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  /** 改进建议 */
  improvementSuggestions: string[];
  /** 评估时间 */
  assessedAt: Date;
}

@Injectable()
export class QualityAssessorService {
  private readonly logger = new Logger(QualityAssessorService.name);

  /**
   * 评估决策质量
   */
  async assessDecisionQuality(
    log: DecisionRunLog,
    plan: TripPlan | null,
    conflicts: ConstraintConflict[],
    feedbacks?: {
      planVariantFeedbacks?: PlanVariantFeedback[];
      conflictFeedbacks?: ConflictFeedback[];
      decisionQualityFeedback?: DecisionQualityFeedback;
    }
  ): Promise<QualityAssessmentResult> {
    this.logger.debug(`[质量评估] 评估决策质量: runId=${log.runId}`);

    // 1. 评估计划质量
    const planQualityScore = this.assessPlanQuality(plan, log);

    // 2. 评估冲突解释质量
    const conflictExplanationQualityScore = this.assessConflictExplanationQuality(
      conflicts,
      feedbacks?.conflictFeedbacks
    );

    // 3. 评估权衡选项质量
    const tradeoffOptionsQualityScore = this.assessTradeoffOptionsQuality(
      conflicts,
      feedbacks?.conflictFeedbacks
    );

    // 4. 评估决策速度
    const decisionSpeedScore = this.assessDecisionSpeed(log);

    // 5. 评估用户满意度
    const userSatisfactionScore = this.assessUserSatisfaction(
      feedbacks?.decisionQualityFeedback,
      feedbacks?.planVariantFeedbacks
    );

    // 6. 计算整体质量分数
    const overallQualityScore = this.calculateOverallQualityScore({
      planQualityScore,
      conflictExplanationQualityScore,
      tradeoffOptionsQualityScore,
      decisionSpeedScore,
      userSatisfactionScore,
    });

    // 7. 确定质量等级
    const qualityGrade = this.determineQualityGrade(overallQualityScore);

    // 8. 生成改进建议
    const improvementSuggestions = this.generateImprovementSuggestions({
      planQualityScore,
      conflictExplanationQualityScore,
      tradeoffOptionsQualityScore,
      decisionSpeedScore,
      userSatisfactionScore,
      overallQualityScore,
    });

    return {
      metrics: {
        planQualityScore,
        conflictExplanationQualityScore,
        tradeoffOptionsQualityScore,
        decisionSpeedScore,
        userSatisfactionScore,
        overallQualityScore,
      },
      qualityGrade,
      improvementSuggestions,
      assessedAt: new Date(),
    };
  }

  /**
   * 评估计划质量
   */
  private assessPlanQuality(
    plan: TripPlan | null,
    log: DecisionRunLog
  ): number {
    if (!plan) {
      return 0;
    }

    let score = 0.5; // 基础分数

    // 1. 检查是否有违规
    if (log.violations && log.violations.length > 0) {
      score -= 0.2 * Math.min(log.violations.length / 5, 1); // 每个违规扣分
    }

    // 2. 检查计划完整性
    if (plan.days && plan.days.length > 0) {
      const totalSlots = plan.days.reduce(
        (sum, day) => sum + (day.timeSlots?.length || 0),
        0
      );
      if (totalSlots > 0) {
        score += 0.2; // 有活动加分
      }
    }

    // 3. 检查是否有解释
    if (log.explanation && log.explanation.length > 0) {
      score += 0.1; // 有解释加分
    }

    // 4. 检查策略组合
    if (log.strategyMix && log.strategyMix.length > 0) {
      score += 0.1; // 有策略组合加分
    }

    // 5. 检查预测影响
    if (log.predictedImpact) {
      score += 0.1; // 有预测影响加分
    }

    return Math.max(0, Math.min(1, score)); // 限制在 0-1 之间
  }

  /**
   * 评估冲突解释质量
   */
  private assessConflictExplanationQuality(
    conflicts: ConstraintConflict[],
    conflictFeedbacks?: ConflictFeedback[]
  ): number {
    if (conflicts.length === 0) {
      return 1.0; // 没有冲突，质量满分
    }

    // 如果没有反馈，基于冲突本身评估
    if (!conflictFeedbacks || conflictFeedbacks.length === 0) {
      // 检查冲突是否有描述和权衡选项
      let score = 0.5;
      for (const conflict of conflicts) {
        if (conflict.description && conflict.description.length > 0) {
          score += 0.2;
        }
        if (conflict.tradeoff_options && conflict.tradeoff_options.length > 0) {
          score += 0.3;
        }
      }
      return Math.max(0, Math.min(1, score / conflicts.length));
    }

    // 基于反馈评估
    let totalScore = 0;
    let count = 0;
    for (const feedback of conflictFeedbacks) {
      let score = 0.5;
      if (feedback.understood) {
        score += 0.3;
      }
      if (feedback.explanationClear) {
        score += 0.2;
      }
      totalScore += score;
      count++;
    }

    return count > 0 ? Math.max(0, Math.min(1, totalScore / count)) : 0.5;
  }

  /**
   * 评估权衡选项质量
   */
  private assessTradeoffOptionsQuality(
    conflicts: ConstraintConflict[],
    conflictFeedbacks?: ConflictFeedback[]
  ): number {
    if (conflicts.length === 0) {
      return 1.0; // 没有冲突，质量满分
    }

    // 如果没有反馈，基于权衡选项数量评估
    if (!conflictFeedbacks || conflictFeedbacks.length === 0) {
      let score = 0.5;
      for (const conflict of conflicts) {
        if (conflict.tradeoff_options && conflict.tradeoff_options.length > 0) {
          score += 0.5 / conflicts.length;
        }
      }
      return Math.max(0, Math.min(1, score));
    }

    // 基于反馈评估
    let totalScore = 0;
    let count = 0;
    for (const feedback of conflictFeedbacks) {
      let score = 0.5;
      if (feedback.tradeoffOptionsUseful) {
        score += 0.5;
      }
      if (feedback.selectedTradeoffOption) {
        score += 0.2; // 用户选择了某个选项，说明选项有用
      }
      totalScore += score;
      count++;
    }

    return count > 0 ? Math.max(0, Math.min(1, totalScore / count)) : 0.5;
  }

  /**
   * 评估决策速度
   */
  private assessDecisionSpeed(_log: DecisionRunLog): number {
    // TODO: 从日志中提取实际决策时间
    // 目前先返回默认值
    return 0.8; // 假设速度较快
  }

  /**
   * 评估用户满意度
   */
  private assessUserSatisfaction(
    decisionQualityFeedback?: DecisionQualityFeedback,
    planVariantFeedbacks?: PlanVariantFeedback[]
  ): number {
    // 如果有决策质量反馈，使用它
    if (decisionQualityFeedback) {
      return decisionQualityFeedback.overallSatisfaction / 5; // 转换为 0-1
    }

    // 如果有计划变体反馈，基于用户选择评估
    if (planVariantFeedbacks && planVariantFeedbacks.length > 0) {
      const selectedCount = planVariantFeedbacks.filter(
        f => f.userChoice === 'selected'
      ).length;
      const rejectedCount = planVariantFeedbacks.filter(
        f => f.userChoice === 'rejected'
      ).length;

      if (selectedCount > rejectedCount) {
        return 0.7; // 用户选择了变体，满意度较高
      } else if (rejectedCount > selectedCount) {
        return 0.3; // 用户拒绝了变体，满意度较低
      } else {
        return 0.5; // 平衡
      }
    }

    return 0.5; // 默认中等满意度
  }

  /**
   * 计算整体质量分数
   */
  private calculateOverallQualityScore(
    metrics: Omit<DecisionQualityMetrics, 'overallQualityScore'>
  ): number {
    // 加权平均
    const weights = {
      planQualityScore: 0.3,
      conflictExplanationQualityScore: 0.2,
      tradeoffOptionsQualityScore: 0.2,
      decisionSpeedScore: 0.1,
      userSatisfactionScore: 0.2,
    };

    return (
      metrics.planQualityScore * weights.planQualityScore +
      metrics.conflictExplanationQualityScore *
        weights.conflictExplanationQualityScore +
      metrics.tradeoffOptionsQualityScore * weights.tradeoffOptionsQualityScore +
      metrics.decisionSpeedScore * weights.decisionSpeedScore +
      metrics.userSatisfactionScore * weights.userSatisfactionScore
    );
  }

  /**
   * 确定质量等级
   */
  private determineQualityGrade(
    overallQualityScore: number
  ): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' {
    if (overallQualityScore >= 0.8) {
      return 'EXCELLENT';
    } else if (overallQualityScore >= 0.6) {
      return 'GOOD';
    } else if (overallQualityScore >= 0.4) {
      return 'FAIR';
    } else {
      return 'POOR';
    }
  }

  /**
   * 生成改进建议
   */
  private generateImprovementSuggestions(
    metrics: DecisionQualityMetrics
  ): string[] {
    const suggestions: string[] = [];

    if (metrics.planQualityScore < 0.6) {
      suggestions.push('计划质量需要改进：减少违规，提高计划完整性');
    }

    if (metrics.conflictExplanationQualityScore < 0.6) {
      suggestions.push('冲突解释质量需要改进：提供更清晰的冲突描述');
    }

    if (metrics.tradeoffOptionsQualityScore < 0.6) {
      suggestions.push('权衡选项质量需要改进：提供更多有用的权衡选项');
    }

    if (metrics.decisionSpeedScore < 0.6) {
      suggestions.push('决策速度需要改进：优化决策算法性能');
    }

    if (metrics.userSatisfactionScore < 0.6) {
      suggestions.push('用户满意度需要改进：收集更多用户反馈并优化决策');
    }

    if (suggestions.length === 0) {
      suggestions.push('整体质量良好，继续保持');
    }

    return suggestions;
  }
}
