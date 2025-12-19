// src/trips/decision/evaluation/evaluation.service.ts

/**
 * 评估与回放框架
 * 
 * 让 DecisionLog 真的变成"学习系统"
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { DecisionRunLog } from '../decision-log';
import { ConstraintCheckResult } from '../constraints';
import { PlanDiff } from '../plan-diff';

export interface PlanMetrics {
  // 可执行率
  executability: {
    violationsCount: number;
    errorCount: number;
    warningCount: number;
    executabilityRate: number; // 0~1, violations=0 的比例
  };

  // 计划稳定性
  stability: {
    editDistanceScore: number;
    changedSlotsRatio: number; // 0~1
    stabilityScore: number; // 0~1, 越高越稳定
  };

  // 体验指标代理
  experience: {
    rhythmBalance: number; // 节奏均衡度 0~1
    diversity: number; // 体验多样性 0~1
    backtrackRatio: number; // 折返率 0~1 (越低越好)
    totalActiveMinutes: number;
    totalTravelMinutes: number;
  };

  // 成本指标
  cost: {
    estimatedTotalCost: number;
    costPerDay: number;
    budgetUtilization: number; // 0~1
  };
}

export interface EvaluationResult {
  planId: string;
  metrics: PlanMetrics;
  timestamp: string;
  version: string;
}

export interface ReplayConfig {
  strategyMix: Array<'abu' | 'drdre' | 'neptune'>;
  policyProfile?: string;
  objectiveWeights?: {
    satisfaction: number;
    violationRisk: number;
    robustness: number;
    cost: number;
  };
}

export interface ReplayResult {
  config: ReplayConfig;
  plan: TripPlan;
  metrics: PlanMetrics;
  log: DecisionRunLog;
  timestamp: string;
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  /**
   * 评估计划指标
   */
  evaluatePlan(
    state: TripWorldState,
    plan: TripPlan,
    constraintResult: ConstraintCheckResult,
    diff?: PlanDiff
  ): PlanMetrics {
    return {
      executability: this.calculateExecutability(constraintResult),
      stability: this.calculateStability(plan, diff),
      experience: this.calculateExperience(state, plan),
      cost: this.calculateCost(state, plan),
    };
  }

  /**
   * 计算可执行率
   */
  private calculateExecutability(
    constraintResult: ConstraintCheckResult
  ): PlanMetrics['executability'] {
    const { violations, summary } = constraintResult;
    const totalSlots = violations.length > 0
      ? violations.length
      : 1; // 避免除零

    return {
      violationsCount: violations.length,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      executabilityRate: summary.errorCount === 0 ? 1.0 : 0.0,
    };
  }

  /**
   * 计算计划稳定性
   */
  private calculateStability(
    plan: TripPlan,
    diff?: PlanDiff
  ): PlanMetrics['stability'] {
    if (!diff) {
      return {
        editDistanceScore: 0,
        changedSlotsRatio: 0,
        stabilityScore: 1.0,
      };
    }

    const totalSlots = plan.days.reduce(
      (sum: number, day) => sum + day.timeSlots.length,
      0
    );

    const changedSlotsRatio =
      totalSlots > 0 ? diff.summary.totalChanged / totalSlots : 0;

    // 稳定性分数：编辑距离越小、改动比例越小，稳定性越高
    const stabilityScore = Math.max(
      0,
      1 - (diff.summary.editDistanceScore / 100) - changedSlotsRatio * 0.5
    );

    return {
      editDistanceScore: diff.summary.editDistanceScore,
      changedSlotsRatio,
      stabilityScore: Math.min(1.0, Math.max(0, stabilityScore)),
    };
  }

  /**
   * 计算体验指标
   */
  private calculateExperience(
    state: TripWorldState,
    plan: TripPlan
  ): PlanMetrics['experience'] {
    let totalActiveMinutes = 0;
    let totalTravelMinutes = 0;
    const dailyActiveMinutes: number[] = [];
    const activityTypes = new Set<string>();
    const coordinates: Array<{ lat: number; lng: number }> = [];

    for (const day of plan.days) {
      let dayActiveMinutes = 0;

      for (const slot of day.timeSlots) {
        if (slot.type !== 'rest' && slot.type !== 'transport') {
          const duration = slot.endTime && slot.time
            ? this.timeDiffMinutes(slot.time, slot.endTime)
            : 60;
          dayActiveMinutes += duration;
          totalActiveMinutes += duration;
          activityTypes.add(slot.type);
        }

        if (slot.travelLegFromPrev) {
          totalTravelMinutes += slot.travelLegFromPrev.durationMin;
        }

        if (slot.coordinates) {
          coordinates.push(slot.coordinates);
        }
      }

      dailyActiveMinutes.push(dayActiveMinutes);
    }

    // 节奏均衡度：每日活动时长的标准差越小越好
    const avgDailyActive = dailyActiveMinutes.length > 0
      ? dailyActiveMinutes.reduce((a, b) => a + b, 0) / dailyActiveMinutes.length
      : 0;
    const variance = dailyActiveMinutes.length > 0
      ? dailyActiveMinutes.reduce(
          (sum, val) => sum + Math.pow(val - avgDailyActive, 2),
          0
        ) / dailyActiveMinutes.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const rhythmBalance = avgDailyActive > 0
      ? Math.max(0, 1 - stdDev / avgDailyActive)
      : 0;

    // 体验多样性：活动类型数量 / 总活动数
    const diversity = activityTypes.size / Math.max(1, totalActiveMinutes / 60);

    // 折返率：计算路径的折返程度
    const backtrackRatio = this.calculateBacktrackRatio(coordinates);

    return {
      rhythmBalance: Math.min(1.0, rhythmBalance),
      diversity: Math.min(1.0, diversity),
      backtrackRatio,
      totalActiveMinutes,
      totalTravelMinutes,
    };
  }

  /**
   * 计算折返率
   */
  private calculateBacktrackRatio(
    coordinates: Array<{ lat: number; lng: number }>
  ): number {
    if (coordinates.length < 3) return 0;

    let backtrackDistance = 0;
    let totalDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];
      const dist = this.calculateDistance(prev, curr);
      totalDistance += dist;

      // 检查是否折返（简化：如果距离很近可能是折返）
      if (i > 1) {
        const prevDist = this.calculateDistance(
          coordinates[i - 2],
          coordinates[i - 1]
        );
        // 如果当前段距离小于前一段的30%，可能是折返
        if (dist < prevDist * 0.3) {
          backtrackDistance += dist;
        }
      }
    }

    return totalDistance > 0 ? backtrackDistance / totalDistance : 0;
  }

  /**
   * 计算成本指标
   */
  private calculateCost(
    state: TripWorldState,
    plan: TripPlan
  ): PlanMetrics['cost'] {
    const estimatedTotalCost = plan.metrics?.estTotalCost || 0;
    const costPerDay =
      state.context.durationDays > 0
        ? estimatedTotalCost / state.context.durationDays
        : 0;

    const budgetUtilization = state.context.budget
      ? Math.min(1.0, estimatedTotalCost / state.context.budget.amount)
      : 0;

    return {
      estimatedTotalCost,
      costPerDay,
      budgetUtilization,
    };
  }

  /**
   * 离线回放：给定同一世界状态，回放不同策略/权重的结果
   */
  async replayWithConfig(
    state: TripWorldState,
    config: ReplayConfig,
    planner: (state: TripWorldState, config: ReplayConfig) => Promise<{
      plan: TripPlan;
      log: DecisionRunLog;
    }>
  ): Promise<ReplayResult> {
    this.logger.debug(`Replaying with config: ${JSON.stringify(config)}`);

    const { plan, log } = await planner(state, config);

    // 评估计划
    const constraintChecker = new (await import('../constraints'))
      .ConstraintChecker();
    const constraintResult = constraintChecker.checkPlan(state, plan);

    const metrics = this.evaluatePlan(state, plan, constraintResult);

    return {
      config,
      plan,
      metrics,
      log,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 批量回放：测试多个配置
   */
  async batchReplay(
    state: TripWorldState,
    configs: ReplayConfig[],
    planner: (state: TripWorldState, config: ReplayConfig) => Promise<{
      plan: TripPlan;
      log: DecisionRunLog;
    }>
  ): Promise<ReplayResult[]> {
    const results: ReplayResult[] = [];

    for (const config of configs) {
      try {
        const result = await this.replayWithConfig(state, config, planner);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Replay failed for config ${JSON.stringify(config)}:`,
          error
        );
      }
    }

    return results;
  }

  /**
   * 比较回放结果
   */
  compareReplayResults(results: ReplayResult[]): {
    bestByExecutability: ReplayResult | null;
    bestByStability: ReplayResult | null;
    bestByExperience: ReplayResult | null;
    bestByCost: ReplayResult | null;
    summary: Array<{
      config: ReplayConfig;
      executabilityRate: number;
      stabilityScore: number;
      experienceScore: number;
      costUtilization: number;
    }>;
  } {
    if (results.length === 0) {
      return {
        bestByExecutability: null,
        bestByStability: null,
        bestByExperience: null,
        bestByCost: null,
        summary: [],
      };
    }

    const bestByExecutability = results.reduce((best, current) =>
      current.metrics.executability.executabilityRate >
      best.metrics.executability.executabilityRate
        ? current
        : best
    );

    const bestByStability = results.reduce((best, current) =>
      current.metrics.stability.stabilityScore >
      best.metrics.stability.stabilityScore
        ? current
        : best
    );

    const bestByExperience = results.reduce((best, current) => {
      const currentScore =
        current.metrics.experience.rhythmBalance *
        current.metrics.experience.diversity *
        (1 - current.metrics.experience.backtrackRatio);
      const bestScore =
        best.metrics.experience.rhythmBalance *
        best.metrics.experience.diversity *
        (1 - best.metrics.experience.backtrackRatio);
      return currentScore > bestScore ? current : best;
    });

    const bestByCost = results.reduce((best, current) =>
      current.metrics.cost.budgetUtilization <
      best.metrics.cost.budgetUtilization
        ? current
        : best
    );

    const summary = results.map(r => ({
      config: r.config,
      executabilityRate: r.metrics.executability.executabilityRate,
      stabilityScore: r.metrics.stability.stabilityScore,
      experienceScore:
        r.metrics.experience.rhythmBalance *
        r.metrics.experience.diversity *
        (1 - r.metrics.experience.backtrackRatio),
      costUtilization: r.metrics.cost.budgetUtilization,
    }));

    return {
      bestByExecutability,
      bestByStability,
      bestByExperience,
      bestByCost,
      summary,
    };
  }

  // 工具方法
  private timeDiffMinutes(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh - sh) * 60 + (em - sm);
  }

  private calculateDistance(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) *
        Math.cos(this.toRad(to.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

