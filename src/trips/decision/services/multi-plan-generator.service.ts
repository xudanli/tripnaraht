// src/trips/decision/services/multi-plan-generator.service.ts

/**
 * 多方案生成器
 * 
 * 并行生成多个方案（不同权衡策略），支持软约束加权评分和权衡分析
 */

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { ConstraintDSL } from '../constraints/constraint-dsl.types';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { ConstraintEngineService } from '../constraints/constraint-engine.service';
import { DailyUtilityCalculatorService } from '../optimization/daily-utility';

export interface PlanVariant {
  id: string; // 'conservative' | 'balanced' | 'aggressive'
  plan: TripPlan;
  score: PlanScore;
  tradeoffs: Tradeoff[];
  feasibility: {
    isValid: boolean;
    violations: number;
    conflicts?: number;
  };
}

export interface PlanScore {
  total: number; // 总分
  breakdown: {
    satisfaction: number; // 满意度（偏好匹配、体验多样性）
    violationRisk: number; // 违约风险（赶不上、闭馆、超预算）
    robustness: number; // 鲁棒性（天气变化能快速替换）
    cost: number; // 成本
  };
}

export interface Tradeoff {
  constraint: string; // 约束名称
  sacrificed: string; // 牺牲了什么
  reason: string; // 为什么牺牲
  can_adjust: boolean; // 是否可以调整
  impact_score?: number; // 影响评分（0-1，越高影响越大）
}

export type StrategyType = 'conservative' | 'balanced' | 'aggressive';

@Injectable()
export class MultiPlanGenerator {
  private readonly logger = new Logger(MultiPlanGenerator.name);

  constructor(
    @Inject(forwardRef(() => TripDecisionEngineService))
    @Optional()
    private readonly decisionEngine?: TripDecisionEngineService,
    @Optional() private readonly constraintEngine?: ConstraintEngineService,
    @Optional() private readonly dailyUtilityCalculator?: DailyUtilityCalculatorService
  ) {}

  /**
   * 并行生成多个方案（不同权衡策略）
   */
  async generateMultiplePlans(
    state: TripWorldState,
    constraints: ConstraintDSL,
    options?: { prefilterFeasibility?: boolean },
  ): Promise<PlanVariant[]> {
    if (!this.decisionEngine) {
      throw new Error('TripDecisionEngineService is required for multi-plan generation');
    }

    const variants: PlanVariant[] = [];

    // 1. 保守方案（优先满足硬约束）
    const conservativePlan = await this.generatePlanWithStrategy(
      state,
      constraints,
      'conservative',
      options,
    );
    if (conservativePlan) {
      variants.push(conservativePlan);
    }

    // 2. 平衡方案（默认）
    const balancedPlan = await this.generatePlanWithStrategy(
      state,
      constraints,
      'balanced',
      options,
    );
    if (balancedPlan) {
      variants.push(balancedPlan);
    }

    // 3. 激进方案（优先满足软约束）
    const aggressivePlan = await this.generatePlanWithStrategy(
      state,
      constraints,
      'aggressive',
      options,
    );
    if (aggressivePlan) {
      variants.push(aggressivePlan);
    }

    this.logger.log(`生成了 ${variants.length} 个方案变体`);

    return variants;
  }

  /**
   * 使用指定策略生成计划
   */
  private async generatePlanWithStrategy(
    state: TripWorldState,
    constraints: ConstraintDSL,
    strategy: StrategyType,
    options?: { prefilterFeasibility?: boolean },
  ): Promise<PlanVariant | null> {
    const prefilterFeasibility = options?.prefilterFeasibility !== false;
    try {
      // 创建策略特定的约束副本
      const strategyConstraints = this.adjustConstraintsForStrategy(constraints, strategy);

      // 创建状态副本（避免修改原始状态）
      const stateCopy = this.cloneState(state);

      // 注入策略特定的约束
      if (this.decisionEngine) {
        // 使用反射调用私有方法（临时方案，理想情况下应该公开方法）
        (this.decisionEngine as any).injectConstraints(stateCopy, strategyConstraints);
      }

      // 生成计划
      const { plan } = await this.decisionEngine!.generatePlan(stateCopy);
      if (!plan) return null;

      // Phase 0：约束前置 - 硬约束违规即淘汰（Canonical 路径可关闭，由 Gateway 统一裁决）
      let feasibilityResult: Awaited<ReturnType<typeof this.checkFeasibility>> | undefined;
      if (prefilterFeasibility) {
        feasibilityResult = await this.checkFeasibility(stateCopy, plan);
        if (!feasibilityResult.feasible) {
          this.logger.debug(
            `[${strategy}] 方案因硬约束违规被淘汰: ${feasibilityResult.infeasibilityExplanation?.summary || '详见 violations'}`,
          );
          return null;
        }
      }

      // 评分（仅可行方案）：优先使用 DailyUtilityCalculator（Phase 2），否则用原有 scorePlan
      const score = this.scorePlanWithUtility(plan, constraints, strategy, stateCopy);

      // 分析权衡
      const tradeoffs = this.analyzeTradeoffs(plan, constraints, strategy, stateCopy);

      if (!prefilterFeasibility) {
        feasibilityResult = await this.checkFeasibility(stateCopy, plan);
      }

      return {
        id: strategy,
        plan,
        score,
        tradeoffs,
        feasibility: {
          isValid: feasibilityResult?.feasible ?? true,
          violations:
            (feasibilityResult?.rawCheckResult.summary.warningCount ?? 0) +
            (feasibilityResult?.rawCheckResult.summary.infoCount ?? 0),
          conflicts: feasibilityResult?.rawCheckResult.conflicts?.conflicts.length || 0,
        },
      };
    } catch (error) {
      this.logger.warn(`生成${strategy}方案失败: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 检查可行性（Phase 0：优先使用 ConstraintEngineService.isFeasible 统一入口）
   */
  private async checkFeasibility(
    state: TripWorldState,
    plan: TripPlan,
  ): Promise<{ feasible: boolean; rawCheckResult: any; infeasibilityExplanation?: any }> {
    if (this.constraintEngine) {
      return this.constraintEngine.isFeasible(state, plan);
    }

    this.logger.warn(
      'ConstraintEngineService unavailable; skipping feasibility prefilter (formal paths must inject engine)',
    );
    return {
      feasible: true,
      rawCheckResult: {
        summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
        conflicts: undefined,
      },
    };
  }

  /**
   * 评分：Phase 2 优先使用 DailyUtilityCalculator，否则用原有 scorePlan
   */
  private scorePlanWithUtility(
    plan: TripPlan,
    constraints: ConstraintDSL,
    strategy: StrategyType,
    state: TripWorldState
  ): PlanScore {
    if (this.dailyUtilityCalculator) {
      const result = this.dailyUtilityCalculator.compute(plan, state);
      return {
        total: result.totalExpectedUtility,
        breakdown: {
          satisfaction: result.dayUtilities.reduce((s, d) => s + d.breakdown.experienceScore, 0) / Math.max(1, result.dayUtilities.length),
          violationRisk: 1 - result.penalties.totalPenalty,
          robustness: 1 - result.penalties.riskPenalty,
          cost: result.dayUtilities.reduce((s, d) => s + d.breakdown.costEfficiency, 0) / Math.max(1, result.dayUtilities.length),
        },
      };
    }
    return this.scorePlan(plan, constraints, strategy, state);
  }

  /**
   * 根据策略调整约束
   */
  private adjustConstraintsForStrategy(
    constraints: ConstraintDSL,
    strategy: StrategyType
  ): ConstraintDSL {
    const adjusted = JSON.parse(JSON.stringify(constraints)) as ConstraintDSL;

    // 调整软约束权重
    if (adjusted.soft_constraints) {
      if (strategy === 'conservative') {
        // 保守策略：降低软约束权重，优先满足硬约束
        if (adjusted.soft_constraints.pace) {
          adjusted.soft_constraints.pace.weight *= 0.7;
        }
        if (adjusted.soft_constraints.comfort_level) {
          adjusted.soft_constraints.comfort_level.weight *= 0.7;
        }
        if (adjusted.soft_constraints.scenery) {
          adjusted.soft_constraints.scenery.weight *= 0.7;
        }
      } else if (strategy === 'aggressive') {
        // 激进策略：提高软约束权重，优先满足偏好
        if (adjusted.soft_constraints.pace) {
          adjusted.soft_constraints.pace.weight = Math.min(1.0, adjusted.soft_constraints.pace.weight * 1.3);
        }
        if (adjusted.soft_constraints.comfort_level) {
          adjusted.soft_constraints.comfort_level.weight = Math.min(1.0, adjusted.soft_constraints.comfort_level.weight * 1.3);
        }
        if (adjusted.soft_constraints.scenery) {
          adjusted.soft_constraints.scenery.weight = Math.min(1.0, adjusted.soft_constraints.scenery.weight * 1.3);
        }
      }
      // balanced策略：保持原权重
    }

    return adjusted;
  }

  /**
   * 评分计划
   */
  private scorePlan(
    plan: TripPlan,
    constraints: ConstraintDSL,
    strategy: StrategyType,
    state: TripWorldState
  ): PlanScore {
    // 1. 满意度评分（偏好匹配、体验多样性）
    const satisfaction = this.calculateSatisfactionScore(plan, constraints, state);

    // 2. 违约风险评分（越低越好，转换为越高越好）
    const violationRisk = this.calculateViolationRiskScore(plan, constraints, state);

    // 3. 鲁棒性评分（天气变化能快速替换）
    const robustness = this.calculateRobustnessScore(plan, constraints, state);

    // 4. 成本评分（越低越好，转换为越高越好）
    const cost = this.calculateCostScore(plan, constraints, state);

    // 根据策略调整权重
    const weights = this.getStrategyWeights(strategy);

    const total =
      satisfaction * weights.satisfaction +
      violationRisk * weights.violationRisk +
      robustness * weights.robustness +
      cost * weights.cost;

    return {
      total,
      breakdown: {
        satisfaction,
        violationRisk,
        robustness,
        cost,
      },
    };
  }

  /**
   * 计算满意度评分
   */
  private calculateSatisfactionScore(
    plan: TripPlan,
    constraints: ConstraintDSL,
    state: TripWorldState
  ): number {
    let score = 0.5; // 基础分

    // 节奏匹配
    if (constraints.soft_constraints?.pace) {
      const preferredPace = constraints.soft_constraints.pace.preference;
      const actualPace = this.calculateActualPace(plan);
      const paceMatch = this.matchPace(preferredPace, actualPace);
      score += paceMatch * constraints.soft_constraints.pace.weight * 0.2;
    }

    // 风景偏好匹配
    if (constraints.soft_constraints?.scenery) {
      const preferredScenery = constraints.soft_constraints.scenery.nature_vs_city;
      const actualScenery = this.calculateActualScenery(plan, state);
      const sceneryMatch = this.matchScenery(preferredScenery, actualScenery);
      score += sceneryMatch * constraints.soft_constraints.scenery.weight * 0.2;
    }

    // 摄影重要性
    if (constraints.soft_constraints?.photography) {
      const photographyScore = this.calculatePhotographyScore(plan, state);
      score += photographyScore * constraints.soft_constraints.photography.importance * 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * 计算违约风险评分（越低越好，转换为越高越好）
   */
  private calculateViolationRiskScore(
    plan: TripPlan,
    constraints: ConstraintDSL,
    state: TripWorldState
  ): number {
    // 简化：基于计划的时间安排和开放时间匹配度
    // 实际应该考虑：时间窗匹配度、预约难度、库存风险等
    let risk = 0.3; // 基础风险

    // 如果计划中有很多需要预约的活动，风险增加
    const bookingRequiredCount = plan.days.reduce(
      (sum, day) =>
        sum +
        day.timeSlots.filter(slot => {
          const candidate = this.findCandidate(slot.poiId, day.date, state);
          return candidate?.requiresBooking;
        }).length,
      0
    );

    if (bookingRequiredCount > plan.days.length * 2) {
      risk += 0.2;
    }

    // 转换为评分（风险越低，评分越高）
    return Math.max(0, 1.0 - risk);
  }

  /**
   * 计算鲁棒性评分
   */
  private calculateRobustnessScore(
    plan: TripPlan,
    constraints: ConstraintDSL,
    state: TripWorldState
  ): number {
    // 简化：基于室内/室外活动比例、备选活动可用性
    let robustness = 0.5; // 基础分

    // 室内活动比例越高，鲁棒性越高
    const indoorCount = plan.days.reduce(
      (sum, day) =>
        sum +
        day.timeSlots.filter(slot => {
          const candidate = this.findCandidate(slot.poiId, day.date, state);
          return candidate?.indoorOutdoor === 'indoor';
        }).length,
      0
    );

    const totalActivities = plan.days.reduce(
      (sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length,
      0
    );

    if (totalActivities > 0) {
      const indoorRatio = indoorCount / totalActivities;
      robustness += indoorRatio * 0.3;
    }

    return Math.min(1.0, robustness);
  }

  /**
   * 计算成本评分（越低越好，转换为越高越好）
   */
  private calculateCostScore(
    plan: TripPlan,
    constraints: ConstraintDSL,
    _state: TripWorldState
  ): number {
    if (!constraints.hard_constraints?.budget) {
      return 0.5; // 没有预算约束，返回中性分
    }

    const budgetMax = constraints.hard_constraints.budget.max;
    const estimatedCost = plan.metrics?.estTotalCost || 0;

    if (estimatedCost === 0) {
      return 0.5; // 无法估算成本
    }

    const costRatio = estimatedCost / budgetMax;

    // 成本越低，评分越高
    if (costRatio <= 0.8) {
      return 1.0; // 成本远低于预算
    } else if (costRatio <= 1.0) {
      return 1.0 - (costRatio - 0.8) * 2.5; // 线性递减
    } else {
      return Math.max(0, 1.0 - (costRatio - 1.0) * 5); // 超预算，快速降低
    }
  }

  /**
   * 获取策略权重
   */
  private getStrategyWeights(strategy: StrategyType): {
    satisfaction: number;
    violationRisk: number;
    robustness: number;
    cost: number;
  } {
    switch (strategy) {
      case 'conservative':
        return {
          satisfaction: 0.8,
          violationRisk: 1.5, // 优先降低风险
          robustness: 1.2,
          cost: 1.0,
        };
      case 'aggressive':
        return {
          satisfaction: 1.5, // 优先满足偏好
          violationRisk: 0.8,
          robustness: 1.0,
          cost: 0.9,
        };
      case 'balanced':
      default:
        return {
          satisfaction: 1.2,
          violationRisk: 1.0,
          robustness: 1.0,
          cost: 1.0,
        };
    }
  }

  /**
   * 分析方案的权衡
   */
  private analyzeTradeoffs(
    plan: TripPlan,
    constraints: ConstraintDSL,
    strategy: StrategyType,
    state: TripWorldState
  ): Tradeoff[] {
    const tradeoffs: Tradeoff[] = [];

    // 分析每个软约束的满足程度
    if (constraints.soft_constraints?.pace) {
      const actualPace = this.calculateActualPace(plan);
      const preferredPace = constraints.soft_constraints.pace.preference;

      if (actualPace !== preferredPace) {
        tradeoffs.push({
          constraint: 'pace',
          sacrificed: `节奏从 ${preferredPace} 调整为 ${actualPace}`,
          reason: strategy === 'conservative' 
            ? '为了满足硬约束（时间/预算）'
            : strategy === 'aggressive'
            ? '为了最大化体验密度'
            : '为了平衡各项约束',
          can_adjust: true,
          impact_score: 0.6,
        });
      }
    }

    if (constraints.soft_constraints?.comfort_level) {
      const preferredQuality = constraints.soft_constraints.comfort_level.hotel_quality;
      // 简化：假设计划中的住宿品质（实际应该从plan中提取）
      const actualQuality = 'medium'; // TODO: 从plan中提取实际住宿品质

      if (actualQuality !== preferredQuality && preferredQuality === 'high') {
        tradeoffs.push({
          constraint: 'comfort_level',
          sacrificed: `住宿品质从 ${preferredQuality} 调整为 ${actualQuality}`,
          reason: '为了满足预算约束',
          can_adjust: true,
          impact_score: 0.7,
        });
      }
    }

    if (constraints.soft_constraints?.scenery) {
      const preferredScenery = constraints.soft_constraints.scenery.nature_vs_city;
      const actualScenery = this.calculateActualScenery(plan, state);

      if (actualScenery !== preferredScenery && preferredScenery !== 'balanced') {
        tradeoffs.push({
          constraint: 'scenery',
          sacrificed: `风景偏好从 ${preferredScenery} 调整为 ${actualScenery}`,
          reason: '为了满足其他约束（时间/可达性）',
          can_adjust: true,
          impact_score: 0.5,
        });
      }
    }

    return tradeoffs;
  }

  /**
   * 计算实际节奏
   */
  private calculateActualPace(plan: TripPlan): 'relaxed' | 'moderate' | 'intense' {
    const avgActivitiesPerDay = plan.days.reduce(
      (sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length,
      0
    ) / plan.days.length;

    if (avgActivitiesPerDay <= 2) {
      return 'relaxed';
    } else if (avgActivitiesPerDay <= 4) {
      return 'moderate';
    } else {
      return 'intense';
    }
  }

  /**
   * 匹配节奏
   */
  private matchPace(
    preferred: 'relaxed' | 'moderate' | 'intense',
    actual: 'relaxed' | 'moderate' | 'intense'
  ): number {
    if (preferred === actual) {
      return 1.0;
    }
    // 相邻节奏给0.7分，相差较远给0.3分
    const paceOrder = ['relaxed', 'moderate', 'intense'];
    const preferredIndex = paceOrder.indexOf(preferred);
    const actualIndex = paceOrder.indexOf(actual);
    const distance = Math.abs(preferredIndex - actualIndex);

    return distance === 1 ? 0.7 : 0.3;
  }

  /**
   * 计算实际风景类型
   */
  private calculateActualScenery(
    plan: TripPlan,
    state: TripWorldState
  ): 'nature' | 'city' | 'balanced' {
    // 简化：基于活动类型判断
    const natureTypes = ['nature', 'sightseeing'];
    const cityTypes = ['museum', 'food', 'shopping'];

    let natureCount = 0;
    let cityCount = 0;

    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        if (slot.poiId) {
          const candidate = this.findCandidate(slot.poiId, day.date, state);
          if (candidate) {
            if (natureTypes.includes(candidate.type)) {
              natureCount++;
            } else if (cityTypes.includes(candidate.type)) {
              cityCount++;
            }
          }
        }
      }
    }

    if (natureCount > cityCount * 1.5) {
      return 'nature';
    } else if (cityCount > natureCount * 1.5) {
      return 'city';
    } else {
      return 'balanced';
    }
  }

  /**
   * 匹配风景类型
   */
  private matchScenery(
    preferred: 'nature' | 'city' | 'balanced',
    actual: 'nature' | 'city' | 'balanced'
  ): number {
    if (preferred === 'balanced' || actual === 'balanced') {
      return 0.8; // 平衡类型给较高分
    }
    return preferred === actual ? 1.0 : 0.5;
  }

  /**
   * 计算摄影评分
   */
  private calculatePhotographyScore(plan: TripPlan, state: TripWorldState): number {
    // 简化：基于是否有观景点、自然景观等
    const photographyTypes = ['nature', 'sightseeing'];
    let photographyCount = 0;

    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        if (slot.poiId) {
          const candidate = this.findCandidate(slot.poiId, day.date, state);
          if (candidate && photographyTypes.includes(candidate.type)) {
            photographyCount++;
          }
        }
      }
    }

    const totalActivities = plan.days.reduce(
      (sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length,
      0
    );

    return totalActivities > 0 ? Math.min(1.0, photographyCount / totalActivities * 2) : 0.5;
  }

  /**
   * 查找候选活动
   */
  private findCandidate(
    poiId: string | undefined,
    date: string,
    state: TripWorldState
  ) {
    if (!poiId) return undefined;
    const candidates = state.candidatesByDate[date] || [];
    return candidates.find(c => c.id === poiId);
  }

  /**
   * 克隆状态（避免修改原始状态）
   */
  private cloneState(state: TripWorldState): TripWorldState {
    return JSON.parse(JSON.stringify(state));
  }
}
