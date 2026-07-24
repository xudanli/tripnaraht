// Round 3: Trip Outcome Calculator
// 6 维 Trip Outcome Score 计算
// 参考: STS 量表, TWS 量表, 期望确认理论

import { Injectable, Logger } from '@nestjs/common';
import {
  TripOutcomeDimensions,
  ExpectationGap,
  GroupAggregationStrategy,
  GroupAggregationResult,
} from '../attribution/types/self-evolution.types';

/**
 * 旅行结果计算请求
 */
export interface TripOutcomeRequest {
  tripId: string;
  userIds: string[];
  // 问卷数据
  questionnaireResponses: {
    overallSatisfaction: number; // 1-7 Likert
    cognitiveEvaluation: number; // 认知评价
    positiveActivation: number; // 正向激活
    negativeActivation: number; // 负向激活
    willingnessToTravelAgain: number; // 愿意再次同行
    groupDynamics: number; // 群组动态
    nps: number; // NPS 0-10
    recommendation: number; // 推荐意愿 1-7
  };
  // 自动计算数据
  plannedBudget: number;
  actualSpent: number;
  plannedActivities: number;
  completedActivities: {
    p0: number;
    p1: number;
  };
  // 安全数据
  hasAccidents: boolean;
  stressEventCount: number;
  // 期望数据
  preTripExpectation: number;
  pastExperienceReference?: number;
  // 权重配置（可选）
  weights?: {
    overallSatisfaction: number;
    budgetAccuracy: number;
    completionQuality: number;
    safety: number;
    repurchase: number;
  };
}

/**
 * 旅行结果计算响应
 */
export interface TripOutcomeResponse {
  tripId: string;
  dimensions: TripOutcomeDimensions;
  overallScore: number;
  expectationGap: ExpectationGap;
  groupAggregation: GroupAggregationResult;
  weights: {
    overallSatisfaction: number;
    budgetAccuracy: number;
    completionQuality: number;
    safety: number;
    repurchase: number;
  };
  computedAt: Date;
}

@Injectable()
export class TripOutcomeCalculator {
  private readonly logger = new Logger(TripOutcomeCalculator.name);

  // 默认权重
  private readonly defaultWeights = {
    overallSatisfaction: 0.30,
    budgetAccuracy: 0.20,
    completionQuality: 0.20,
    safety: 0.15,
    repurchase: 0.15,
  };

  /**
   * 计算 6 维 Trip Outcome Score
   */
  async calculate(request: TripOutcomeRequest): Promise<TripOutcomeResponse> {
    const weights = { ...this.defaultWeights, ...request.weights };

    // 计算各维度
    const dimensions = this.calculateDimensions(request, weights);

    // 计算总体分数
    const overallScore = this.calculateOverallScore(dimensions, weights);

    // 计算期望差距
    const expectationGap = this.calculateExpectationGap(request);

    // 群组聚合（如果有多个用户）
    const groupAggregation = this.calculateGroupAggregation(
      request,
      dimensions,
    );

    return {
      tripId: request.tripId,
      dimensions,
      overallScore,
      expectationGap,
      groupAggregation,
      weights,
      computedAt: new Date(),
    };
  }

  /**
   * 计算各维度分数
   */
  private calculateDimensions(
    request: TripOutcomeRequest,
    weights: any,
  ): TripOutcomeDimensions {
    return {
      overallSatisfaction: this.calculateOverallSatisfaction(
        request.questionnaireResponses,
      ),
      budgetAccuracy: this.calculateBudgetAccuracy(request),
      completionQuality: this.calculateCompletionQuality(request),
      safety: this.calculateSafety(request),
      repurchase: this.calculateRepurchase(request.questionnaireResponses),
    };
  }

  /**
   * 计算整体满意度 (STS 量表简化版)
   */
  private calculateOverallSatisfaction(responses: any): TripOutcomeDimensions['overallSatisfaction'] {
    // STS 三维度：认知评价、正向激活、负向激活
    const cognitiveEvaluation = this.normalizeTo01(responses.cognitiveEvaluation, 7);
    const positiveActivation = this.normalizeTo01(responses.positiveActivation, 7);
    const negativeActivation = this.normalizeTo01(responses.negativeActivation, 7);

    // 综合分数（负向激活是反向的）
    const score = (cognitiveEvaluation * 0.4 + positiveActivation * 0.4 + (1 - negativeActivation) * 0.2);

    return {
      cognitiveEvaluation,
      positiveActivation,
      negativeActivation,
      score,
    };
  }

  /**
   * 计算预算准确度
   */
  private calculateBudgetAccuracy(request: TripOutcomeRequest): TripOutcomeDimensions['budgetAccuracy'] {
    const deviation = Math.abs(request.actualSpent - request.plannedBudget) / request.plannedBudget;
    // 偏差越小分数越高
    const score = Math.max(0, 1 - deviation);

    return {
      deviation,
      score,
    };
  }

  /**
   * 计算行程完成质量
   */
  private calculateCompletionQuality(request: TripOutcomeRequest): TripOutcomeDimensions['completionQuality'] {
    const p0CompletionRate = request.completedActivities.p0 / request.plannedActivities;
    const p1CompletionRate = request.completedActivities.p1 / request.plannedActivities;

    // 加权完成率（P0 权重更高）
    const weightedCompletionRate = p0CompletionRate * 1.0 + p1CompletionRate * 0.5;
    const maxPossible = 1.0 + 0.5; // P0 + P1 权重
    const score = weightedCompletionRate / maxPossible;

    // 深度 vs 广度（简化：P0 完成率作为深度指标）
    const depthVsBreadth = p0CompletionRate;

    return {
      p0CompletionRate,
      p1CompletionRate,
      depthVsBreadth,
      score,
    };
  }

  /**
   * 计算安全/无事故
   */
  private calculateSafety(request: TripOutcomeRequest): TripOutcomeDimensions['safety'] {
    const hasAccidents = request.hasAccidents;
    const stressEventCount = request.stressEventCount;

    // 基础分数：无事故 = 1.0
    let score = hasAccidents ? 0 : 1.0;

    // 压力事件惩罚（适度压力可能增强体验，但超过阈值惩罚）
    if (stressEventCount > 5) {
      score *= 0.8;
    } else if (stressEventCount > 3) {
      score *= 0.9;
    }

    return {
      hasAccidents,
      stressEventCount,
      score,
    };
  }

  /**
   * 计算复购/推荐意愿
   */
  private calculateRepurchase(responses: any): TripOutcomeDimensions['repurchase'] {
    const nps = this.normalizeTo01(responses.nps, 10);
    const recommendation = this.normalizeTo01(responses.recommendation, 7);

    const score = (nps * 0.5 + recommendation * 0.5);

    return {
      nps,
      recommendation,
      score,
    };
  }

  /**
   * 计算总体分数（加权平均）
   */
  private calculateOverallScore(
    dimensions: TripOutcomeDimensions,
    weights: any,
  ): number {
    return (
      dimensions.overallSatisfaction.score * weights.overallSatisfaction +
      dimensions.budgetAccuracy.score * weights.budgetAccuracy +
      dimensions.completionQuality.score * weights.completionQuality +
      dimensions.safety.score * weights.safety +
      dimensions.repurchase.score * weights.repurchase
    );
  }

  /**
   * 计算期望差距
   */
  private calculateExpectationGap(request: TripOutcomeRequest): ExpectationGap {
    const preTripExpectation = this.normalizeTo01(request.preTripExpectation, 10);
    const postTripSatisfaction = this.normalizeTo01(
      request.questionnaireResponses.overallSatisfaction,
      7,
    );
    const gap = postTripSatisfaction - preTripExpectation;

    // 参考点
    const pastExperience = request.pastExperienceReference
      ? this.normalizeTo01(request.pastExperienceReference, 10)
      : preTripExpectation;
    return {
      preTripExpectation,
      postTripSatisfaction,
      gap,
      referencePoints: {
        pastExperience,
        preTripExpectation,
      },
    };
  }

  /**
   * 群组聚合
   */
  private calculateGroupAggregation(
    request: TripOutcomeRequest,
    dimensions: TripOutcomeDimensions,
  ): GroupAggregationResult {
    // 如果只有一个用户，直接返回
    if (request.userIds.length === 1) {
      return {
        strategy: GroupAggregationStrategy.AVERAGE,
        individualScores: new Map([[request.userIds[0], dimensions.overallSatisfaction.score]]),
        aggregatedScore: dimensions.overallSatisfaction.score,
        fairnessWeights: new Map([[request.userIds[0], 1.0]]),
        satisfiedMembers: request.userIds,
        unsatisfiedMembers: [],
        lmsThreshold: 0.5,
      };
    }

    // 多用户：使用 Weighted Least Misery
    // 这里简化实现，实际应该从多个用户的问卷数据计算
    const individualScores = new Map<string, number>();
    request.userIds.forEach(userId => {
      individualScores.set(userId, dimensions.overallSatisfaction.score);
    });

    const lmsThreshold = 0.5;
    const minScore = Math.min(...Array.from(individualScores.values()));

    // LMS 约束
    if (minScore < lmsThreshold) {
      return {
        strategy: GroupAggregationStrategy.LEAST_MISERY,
        individualScores,
        aggregatedScore: minScore,
        fairnessWeights: new Map(),
        satisfiedMembers: [],
        unsatisfiedMembers: request.userIds,
        lmsThreshold,
      };
    }

    // 约束内最大化加权平均
    const fairnessWeights = new Map<string, number>();
    request.userIds.forEach(userId => {
      fairnessWeights.set(userId, 1.0 / request.userIds.length);
    });

    const weightedSum = Array.from(individualScores.entries()).reduce(
      (sum, [userId, score]) => sum + score * (fairnessWeights.get(userId) || 0),
      0,
    );

    const satisfiedMembers = request.userIds.filter(
      userId => (individualScores.get(userId) || 0) >= lmsThreshold,
    );
    const unsatisfiedMembers = request.userIds.filter(
      userId => (individualScores.get(userId) || 0) < lmsThreshold,
    );

    return {
      strategy: GroupAggregationStrategy.WEIGHTED_LEAST_MISERY,
      individualScores,
      aggregatedScore: weightedSum,
      fairnessWeights,
      satisfiedMembers,
      unsatisfiedMembers,
      lmsThreshold,
    };
  }

  /**
   * 将 Likert 量表归一化到 0-1
   */
  private normalizeTo01(value: number, max: number): number {
    return Math.max(0, Math.min(1, (value - 1) / (max - 1)));
  }

  /**
   * 批量计算
   */
  async calculateBatch(requests: TripOutcomeRequest[]): Promise<TripOutcomeResponse[]> {
    return Promise.all(requests.map(req => this.calculate(req)));
  }
}
