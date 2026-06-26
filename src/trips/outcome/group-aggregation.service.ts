// Round 3: Group Aggregation Service
// Weighted Least Misery (WLM) 群组聚合策略
// 参考: CEUR 2021, ACM 2025 序列公平

import { Injectable, Logger } from '@nestjs/common';
import {
  GroupAggregationStrategy,
  GroupAggregationResult,
} from '../attribution/types/self-evolution.types';

/**
 * 群组聚合配置
 */
interface GroupAggregationConfig {
  lmsThreshold: number; // LMS 阈值
  fairnessDecay: number; // 公平性权重衰减因子
  minFairnessWeight: number; // 最小公平性权重
}

/**
 * 历史公平性计数器
 */
interface FairnessCounter {
  userId: string;
  satisfactionCount: number;
  totalTrips: number;
  lastSatisfiedAt: Date;
  fairnessWeight: number;
}

@Injectable()
export class GroupAggregationService {
  private readonly logger = new Logger(GroupAggregationService.name);
  private config: GroupAggregationConfig = {
    lmsThreshold: 0.5,
    fairnessDecay: 0.1,
    minFairnessWeight: 0.3,
  };

  // 内存中的公平性计数器（实际应该从数据库读取）
  private fairnessCounters = new Map<string, FairnessCounter>();

  /**
   * Weighted Least Misery 聚合
   * @param individualScores 个人满意度分数
   * @param strategy 聚合策略
   * @param historicalFairness 历史公平性计数器（可选）
   * @returns 群组聚合结果
   */
  calculateWLM(
    individualScores: Map<string, number>,
    strategy: GroupAggregationStrategy = GroupAggregationStrategy.WEIGHTED_LEAST_MISERY,
    historicalFairness?: Map<string, FairnessCounter>,
  ): GroupAggregationResult {
    const scores = Array.from(individualScores.values());
    const minScore = Math.min(...scores);

    // 根据策略选择聚合方法
    switch (strategy) {
      case GroupAggregationStrategy.AVERAGE:
        return this.calculateAverage(individualScores);
      case GroupAggregationStrategy.LEAST_MISERY:
        return this.calculateLeastMisery(individualScores);
      case GroupAggregationStrategy.WEIGHTED_LEAST_MISERY:
        return this.calculateWeightedLeastMisery(
          individualScores,
          historicalFairness,
        );
      case GroupAggregationStrategy.SEQUENTIAL_FAIRNESS:
        return this.calculateSequentialFairness(
          individualScores,
          historicalFairness,
        );
      default:
        return this.calculateWeightedLeastMisery(
          individualScores,
          historicalFairness,
        );
    }
  }

  /**
   * 简单平均
   */
  private calculateAverage(individualScores: Map<string, number>): GroupAggregationResult {
    const scores = Array.from(individualScores.values());
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      strategy: GroupAggregationStrategy.AVERAGE,
      individualScores,
      aggregatedScore: average,
      fairnessWeights: new Map(),
      satisfiedMembers: Array.from(individualScores.keys()),
      unsatisfiedMembers: [],
      lmsThreshold: this.config.lmsThreshold,
    };
  }

  /**
   * Least Misery (LMS)
   * 返回最低分，确保没有人极度不满
   */
  private calculateLeastMisery(individualScores: Map<string, number>): GroupAggregationResult {
    const scores = Array.from(individualScores.values());
    const minScore = Math.min(...scores);
    const minUserId = Array.from(individualScores.entries()).find(
      ([, score]) => score === minScore,
    )?.[0];

    return {
      strategy: GroupAggregationStrategy.LEAST_MISERY,
      individualScores,
      aggregatedScore: minScore,
      fairnessWeights: new Map(),
      satisfiedMembers: minScore >= this.config.lmsThreshold
        ? Array.from(individualScores.keys())
        : [],
      unsatisfiedMembers: minScore < this.config.lmsThreshold
        ? [minUserId || '']
        : [],
      lmsThreshold: this.config.lmsThreshold,
    };
  }

  /**
   * Weighted Least Misery (WLM)
   * LMS 下限约束 + 约束内最大化加权平均
   */
  private calculateWeightedLeastMisery(
    individualScores: Map<string, number>,
    historicalFairness?: Map<string, FairnessCounter>,
  ): GroupAggregationResult {
    const scores = Array.from(individualScores.values());
    const minScore = Math.min(...scores);

    // LMS 约束
    if (minScore < this.config.lmsThreshold) {
      return this.calculateLeastMisery(individualScores);
    }

    // 计算公平性权重
    const fairnessWeights = this.calculateFairnessWeights(
      individualScores,
      historicalFairness,
    );

    // 加权平均
    const weightedSum = Array.from(individualScores.entries()).reduce(
      (sum, [userId, score]) => sum + score * (fairnessWeights.get(userId) || 1),
      0,
    );
    const totalWeight = Array.from(fairnessWeights.values()).reduce((a, b) => a + b, 0);
    const aggregatedScore = weightedSum / totalWeight;

    // 分类成员
    const satisfiedMembers = Array.from(individualScores.entries())
      .filter(([, score]) => score >= this.config.lmsThreshold)
      .map(([userId]) => userId);
    const unsatisfiedMembers = Array.from(individualScores.entries())
      .filter(([, score]) => score < this.config.lmsThreshold)
      .map(([userId]) => userId);

    return {
      strategy: GroupAggregationStrategy.WEIGHTED_LEAST_MISERY,
      individualScores,
      aggregatedScore,
      fairnessWeights,
      satisfiedMembers,
      unsatisfiedMembers,
      lmsThreshold: this.config.lmsThreshold,
    };
  }

  /**
   * 序列公平
   * 跨多次旅行轮流满足每个人的偏好
   */
  private calculateSequentialFairness(
    individualScores: Map<string, number>,
    historicalFairness?: Map<string, FairnessCounter>,
  ): GroupAggregationResult {
    // 获取或初始化公平性计数器
    const counters = historicalFairness || this.initializeCounters(individualScores);

    // 计算公平性权重（历史满足次数少的权重更高）
    const fairnessWeights = new Map<string, number>();
    const totalTrips = Array.from(counters.values()).reduce(
      (sum, c) => sum + c.totalTrips,
      0,
    );

    for (const [userId, counter] of counters) {
      // 反比权重：满足次数越少，权重越高
      const satisfactionRate =
        counter.totalTrips > 0
          ? counter.satisfactionCount / counter.totalTrips
          : 0.5;
      fairnessWeights.set(
        userId,
        Math.max(
          this.config.minFairnessWeight,
          1 - satisfactionRate + this.config.fairnessDecay,
        ),
      );
    }

    // 归一化权重
    const totalWeight = Array.from(fairnessWeights.values()).reduce((a, b) => a + b, 0);
    for (const [userId, weight] of fairnessWeights) {
      fairnessWeights.set(userId, weight / totalWeight);
    }

    // 加权平均
    const weightedSum = Array.from(individualScores.entries()).reduce(
      (sum, [userId, score]) => sum + score * (fairnessWeights.get(userId) || 0),
      0,
    );
    const aggregatedScore = weightedSum;

    // 更新计数器（假设当前选择满足所有成员）
    this.updateCounters(individualScores, counters, true);

    return {
      strategy: GroupAggregationStrategy.SEQUENTIAL_FAIRNESS,
      individualScores,
      aggregatedScore,
      fairnessWeights,
      satisfiedMembers: Array.from(individualScores.keys()),
      unsatisfiedMembers: [],
      lmsThreshold: this.config.lmsThreshold,
    };
  }

  /**
   * 计算公平性权重
   */
  private calculateFairnessWeights(
    individualScores: Map<string, number>,
    historicalFairness?: Map<string, FairnessCounter>,
  ): Map<string, number> {
    const weights = new Map<string, number>();

    if (!historicalFairness) {
      // 没有历史数据，均等权重
      for (const userId of individualScores.keys()) {
        weights.set(userId, 1.0 / individualScores.size);
      }
      return weights;
    }

    // 基于历史数据计算权重
    const totalTrips = Array.from(historicalFairness.values()).reduce(
      (sum, c) => sum + c.totalTrips,
      0,
    );

    for (const [userId, counter] of historicalFairness) {
      // 满足率越低，权重越高
      const satisfactionRate =
        counter.totalTrips > 0
          ? counter.satisfactionCount / counter.totalTrips
          : 0.5;
      weights.set(
        userId,
        Math.max(
          this.config.minFairnessWeight,
          1 - satisfactionRate + this.config.fairnessDecay,
        ),
      );
    }

    // 归一化
    const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    for (const [userId, weight] of weights) {
      weights.set(userId, weight / totalWeight);
    }

    return weights;
  }

  /**
   * 初始化公平性计数器
   */
  private initializeCounters(individualScores: Map<string, number>): Map<string, FairnessCounter> {
    const counters = new Map<string, FairnessCounter>();
    for (const userId of individualScores.keys()) {
      counters.set(userId, {
        userId,
        satisfactionCount: 0,
        totalTrips: 0,
        lastSatisfiedAt: new Date(),
        fairnessWeight: 1.0,
      });
    }
    return counters;
  }

  /**
   * 更新公平性计数器
   */
  private updateCounters(
    individualScores: Map<string, number>,
    counters: Map<string, FairnessCounter>,
    allSatisfied: boolean,
  ): void {
    for (const [userId, score] of individualScores) {
      const counter = counters.get(userId);
      if (!counter) continue;

      counter.totalTrips++;
      if (score >= this.config.lmsThreshold) {
        counter.satisfactionCount++;
        counter.lastSatisfiedAt = new Date();
      }

      // 更新公平性权重
      const satisfactionRate = counter.satisfactionCount / counter.totalTrips;
      counter.fairnessWeight = Math.max(
        this.config.minFairnessWeight,
        1 - satisfactionRate + this.config.fairnessDecay,
      );
    }
  }

  /**
   * 获取公平性计数器
   */
  getFairnessCounters(): Map<string, FairnessCounter> {
    return new Map(this.fairnessCounters);
  }

  /**
   * 设置公平性计数器
   */
  setFairnessCounters(counters: Map<string, FairnessCounter>): void {
    this.fairnessCounters = new Map(counters);
  }

  /**
   * 更新单个用户的公平性计数器
   */
  updateFairnessCounter(userId: string, satisfied: boolean): void {
    let counter = this.fairnessCounters.get(userId);
    if (!counter) {
      counter = {
        userId,
        satisfactionCount: 0,
        totalTrips: 0,
        lastSatisfiedAt: new Date(),
        fairnessWeight: 1.0,
      };
      this.fairnessCounters.set(userId, counter);
    }

    counter.totalTrips++;
    if (satisfied) {
      counter.satisfactionCount++;
      counter.lastSatisfiedAt = new Date();
    }

    // 更新公平性权重
    const satisfactionRate = counter.satisfactionCount / counter.totalTrips;
    counter.fairnessWeight = Math.max(
      this.config.minFairnessWeight,
      1 - satisfactionRate + this.config.fairnessDecay,
    );
  }

  /**
   * 获取用户的公平性权重
   */
  getFairnessWeight(userId: string): number {
    const counter = this.fairnessCounters.get(userId);
    return counter?.fairnessWeight || 1.0;
  }

  /**
   * 重置公平性计数器
   */
  resetFairnessCounters(): void {
    this.fairnessCounters.clear();
  }

  /**
   * 配置更新
   */
  updateConfig(config: Partial<GroupAggregationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log('Group aggregation config updated', this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): GroupAggregationConfig {
    return { ...this.config };
  }
}
