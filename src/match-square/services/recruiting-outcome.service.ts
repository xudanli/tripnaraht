// Recruiting Outcome Service
// 招募结果服务 - 评估招募成功度

import { Injectable, Logger } from '@nestjs/common';
import {
  RecruitingOutcome,
  RecruitingMetrics,
  RecruitingFactor,
  RecruitingFactorType,
  RecruitingOutcomeRequest,
  RecruitingOutcomeResult,
  RecruitmentSuccessLevel,
} from '../types/recruiting-runtime.types';
import { TripSuccessLevel } from '../../trips/outcome/types/travel-outcome.types';

@Injectable()
export class RecruitingOutcomeService {
  private readonly logger = new Logger(RecruitingOutcomeService.name);

  /**
   * 计算招募结果
   */
  async calculate(request: RecruitingOutcomeRequest): Promise<RecruitingOutcomeResult> {
    const { postId, tripId, tripOutcome, applications, post } = request;

    // 计算指标
    const metrics = this.calculateMetrics(applications, post);

    // 计算成功等级
    const successLevel = this.calculateSuccessLevel(metrics, tripOutcome);

    // 提取影响因素
    const factors = this.extractFactors(request, metrics);

    // 生成推荐
    const recommendations = this.generateRecommendations(metrics, factors, successLevel);

    // 评估数据质量
    const dataQuality = this.assessDataQuality(request, metrics);

    // 计算置信度
    const confidence = this.calculateConfidence(dataQuality, factors.length);

    const outcome: RecruitingOutcome = {
      id: `${postId}-outcome`,
      postId,
      tripId,
      successLevel,
      metrics,
      factors,
      recommendations,
      computedAt: new Date(),
      dataQuality,
      confidence,
    };

    return {
      outcome,
      timestamp: new Date(),
    };
  }

  /**
   * 批量计算招募结果
   */
  async calculateBatch(requests: RecruitingOutcomeRequest[]): Promise<RecruitingOutcomeResult[]> {
    return Promise.all(requests.map(req => this.calculate(req)));
  }

  /**
   * 计算招募指标
   */
  private calculateMetrics(
    applications?: Array<{ status: string; decidedAt?: Date }>,
    post?: { slotsNeeded?: number; publishedAt?: Date; closedAt?: Date },
  ): RecruitingMetrics {
    if (!applications || applications.length === 0) {
      return {
        timeToFill: 0,
        applicationCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        conversionRate: 0,
        matchSuccessRate: 0,
        teamPerformance: 0,
        attritionRate: 0,
      };
    }

    const applicationCount = applications.length;
    const approvedCount = applications.filter(a => a.status === 'approved').length;
    const rejectedCount = applications.filter(a => a.status === 'rejected').length;
    const conversionRate = applicationCount > 0 ? approvedCount / applicationCount : 0;

    // 计算招募耗时
    let timeToFill = 0;
    if (post?.publishedAt && post?.closedAt) {
      timeToFill = Math.ceil(
        (new Date(post.closedAt).getTime() - new Date(post.publishedAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );
    } else if (post?.publishedAt && applications.some(a => a.decidedAt)) {
      const firstDecision = applications
        .filter(a => a.decidedAt)
        .sort((a, b) => new Date(a.decidedAt!).getTime() - new Date(b.decidedAt!).getTime())[0];
      if (firstDecision) {
        timeToFill = Math.ceil(
          (new Date(firstDecision.decidedAt!).getTime() - new Date(post.publishedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        );
      }
    }

    // 匹配成功率（假设批准的都成团）
    const matchSuccessRate = approvedCount > 0 ? 0.8 : 0; // 简化逻辑，实际需要跟踪成团情况

    // 团队表现（如果有 Trip Outcome）
    const teamPerformance = 0.7; // 默认值，实际从 Trip Outcome 获取

    // 退出率（简化）
    const attritionRate = 0.1; // 默认值

    return {
      timeToFill,
      applicationCount,
      approvedCount,
      rejectedCount,
      conversionRate,
      matchSuccessRate,
      teamPerformance,
      attritionRate,
    };
  }

  /**
   * 计算成功等级
   */
  private calculateSuccessLevel(
    metrics: RecruitingMetrics,
    tripOutcome?: { successLevel: TripSuccessLevel; overallScore: number },
  ): RecruitmentSuccessLevel {
    const { conversionRate, matchSuccessRate, teamPerformance } = metrics;

    // 如果有 Trip Outcome，优先使用
    if (tripOutcome) {
      const tripSuccessScore = this.mapTripSuccessToScore(tripOutcome.successLevel);
      const combinedScore = (conversionRate * 0.3 + matchSuccessRate * 0.3 + teamPerformance * 0.2 + tripSuccessScore * 0.2);

      if (combinedScore >= 0.85) return RecruitmentSuccessLevel.EXCELLENT;
      if (combinedScore >= 0.7) return RecruitmentSuccessLevel.GOOD;
      if (combinedScore >= 0.5) return RecruitmentSuccessLevel.ACCEPTABLE;
      if (combinedScore >= 0.3) return RecruitmentSuccessLevel.POOR;
      return RecruitmentSuccessLevel.FAILED;
    }

    // 没有 Trip Outcome，仅使用招募指标
    const combinedScore = conversionRate * 0.4 + matchSuccessRate * 0.4 + teamPerformance * 0.2;

    if (combinedScore >= 0.8) return RecruitmentSuccessLevel.EXCELLENT;
    if (combinedScore >= 0.6) return RecruitmentSuccessLevel.GOOD;
    if (combinedScore >= 0.4) return RecruitmentSuccessLevel.ACCEPTABLE;
    if (combinedScore >= 0.2) return RecruitmentSuccessLevel.POOR;
    return RecruitmentSuccessLevel.FAILED;
  }

  /**
   * 映射 Trip Success Level 到分数
   */
  private mapTripSuccessToScore(successLevel: TripSuccessLevel): number {
    const mapping: Record<TripSuccessLevel, number> = {
      [TripSuccessLevel.EXCELLENT]: 1.0,
      [TripSuccessLevel.GOOD]: 0.8,
      [TripSuccessLevel.ACCEPTABLE]: 0.6,
      [TripSuccessLevel.POOR]: 0.4,
      [TripSuccessLevel.FAILED]: 0.2,
    };
    return mapping[successLevel] || 0.5;
  }

  /**
   * 提取影响因素
   */
  private extractFactors(request: RecruitingOutcomeRequest, metrics: RecruitingMetrics): RecruitingFactor[] {
    const factors: RecruitingFactor[] = [];

    // 兼容性准确度（基于归因数据）
    const compatibilityAccuracy = this.calculateCompatibilityAccuracy(request.applications);
    if (compatibilityAccuracy < 0.6) {
      factors.push({
        type: RecruitingFactorType.COMPATIBILITY_ACCURACY,
        impact: 1 - compatibilityAccuracy,
        description: '兼容性预测准确度较低',
        details: { accuracy: compatibilityAccuracy },
      });
    }

    // 岗位填充率
    if (request.post?.slotsNeeded) {
      const slotFillRate = metrics.approvedCount / request.post.slotsNeeded;
      if (slotFillRate < 0.8) {
        factors.push({
          type: RecruitingFactorType.SLOT_FILL_RATE,
          impact: 1 - slotFillRate,
          description: '岗位填充率不足',
          details: { fillRate: slotFillRate, needed: request.post.slotsNeeded, filled: metrics.approvedCount },
        });
      }
    }

    // 招募耗时
    if (metrics.timeToFill > 7) {
      factors.push({
        type: RecruitingFactorType.SATISFACTION_SCORE,
        impact: Math.min(1, metrics.timeToFill / 30),
        description: '招募耗时较长',
        details: { days: metrics.timeToFill },
      });
    }

    // 转化率
    if (metrics.conversionRate < 0.3) {
      factors.push({
        type: RecruitingFactorType.SATISFACTION_SCORE,
        impact: 1 - metrics.conversionRate,
        description: '申请转化率较低',
        details: { conversionRate: metrics.conversionRate },
      });
    }

    // 团队表现
    if (metrics.teamPerformance < 0.6) {
      factors.push({
        type: RecruitingFactorType.SATISFACTION_SCORE,
        impact: 1 - metrics.teamPerformance,
        description: '团队表现不佳',
        details: { teamPerformance: metrics.teamPerformance },
      });
    }

    // 退出率
    if (metrics.attritionRate > 0.2) {
      factors.push({
        type: RecruitingFactorType.CONFLICT_RATE,
        impact: metrics.attritionRate,
        description: '成员退出率较高',
        details: { attritionRate: metrics.attritionRate },
      });
    }

    return factors;
  }

  /**
   * 计算兼容性准确度
   */
  private calculateCompatibilityAccuracy(applications?: Array<{ attribution?: any }>): number {
    if (!applications || applications.length === 0) return 0.5;

    const withAttribution = applications.filter(a => a.attribution);
    if (withAttribution.length === 0) return 0.5;

    // 简化逻辑：统计高置信度的归因比例
    const highConfidenceCount = withAttribution.filter(
      a => a.attribution?.confidence === 'HIGH',
    ).length;

    return highConfidenceCount / withAttribution.length;
  }

  /**
   * 生成推荐
   */
  private generateRecommendations(
    metrics: RecruitingMetrics,
    factors: RecruitingFactor[],
    successLevel: RecruitmentSuccessLevel,
  ): string[] {
    const recommendations: string[] = [];

    // 基于成功等级的推荐
    if (successLevel === RecruitmentSuccessLevel.FAILED) {
      recommendations.push('招募失败，建议重新评估招募策略和岗位需求');
    } else if (successLevel === RecruitmentSuccessLevel.POOR) {
      recommendations.push('招募表现较差，建议优化招募帖和筛选标准');
    }

    // 基于因素的推荐
    factors.forEach(factor => {
      switch (factor.type) {
        case RecruitingFactorType.COMPATIBILITY_ACCURACY:
          recommendations.push('优化兼容性评分算法，增加技能和经验权重');
          break;
        case RecruitingFactorType.SLOT_FILL_RATE:
          recommendations.push('增加招募帖曝光，考虑降低初始筛选标准');
          break;
        case RecruitingFactorType.TEAM_DIVERSITY:
          recommendations.push('增加团队多样性目标，吸引不同背景的申请者');
          break;
        case RecruitingFactorType.COMMUNICATION_QUALITY:
          recommendations.push('强化沟通流程，增加申请前的互动环节');
          break;
        case RecruitingFactorType.CONFLICT_RATE:
          recommendations.push('强化交互模式匹配，提前识别潜在冲突');
          break;
        case RecruitingFactorType.SATISFACTION_SCORE:
          if (factor.details?.days) {
            recommendations.push(`招募耗时 ${factor.details.days} 天，建议增加推广渠道`);
          }
          if (factor.details?.conversionRate) {
            recommendations.push(`转化率仅 ${(factor.details.conversionRate * 100).toFixed(1)}%，建议优化招募帖文案`);
          }
          break;
      }
    });

    // 基于指标的推荐
    if (metrics.timeToFill > 14) {
      recommendations.push('招募耗时超过两周，建议考虑付费推广或降低门槛');
    }

    if (metrics.conversionRate < 0.2) {
      recommendations.push('转化率低于 20%，建议检查筛选标准是否过严');
    }

    if (metrics.matchSuccessRate < 0.5) {
      recommendations.push('匹配成功率低于 50%，建议优化成团流程');
    }

    return recommendations.length > 0 ? recommendations : ['招募表现良好，保持当前策略'];
  }

  /**
   * 评估数据质量
   */
  private assessDataQuality(request: RecruitingOutcomeRequest, metrics: RecruitingMetrics): number {
    let qualityScore = 1.0;
    const missingFields: string[] = [];

    if (!request.applications || request.applications.length === 0) {
      missingFields.push('applications');
      qualityScore -= 0.3;
    }

    if (!request.post) {
      missingFields.push('post');
      qualityScore -= 0.2;
    }

    if (!request.tripOutcome) {
      missingFields.push('tripOutcome');
      qualityScore -= 0.2;
    }

    if (metrics.applicationCount === 0) {
      qualityScore -= 0.1;
    }

    if (metrics.approvedCount === 0 && metrics.rejectedCount === 0) {
      qualityScore -= 0.1;
    }

    return Math.max(0, qualityScore);
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(dataQuality: number, factorCount: number): number {
    // 数据质量占 70%，因素数量占 30%
    const factorScore = Math.min(1, factorCount / 5);
    return dataQuality * 0.7 + factorScore * 0.3;
  }
}
