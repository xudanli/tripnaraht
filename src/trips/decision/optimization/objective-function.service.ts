// src/trips/decision/optimization/objective-function.service.ts
/**
 * TripNARA 统一目标函数服务
 * 
 * Phase 1 实现：
 * - 计算八维度效用分数
 * - 约束检查与满足度评估
 * - 候选方案比较
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  IObjectiveFunction,
  ObjectiveFunctionWeights,
  ObjectiveEvaluationResult,
  Constraint,
  ConstraintSatisfactionResult,
  CandidateComparisonResult,
  DEFAULT_OBJECTIVE_WEIGHTS,
  HardConstraintType,
  SoftConstraintType,
} from './objective-function.interface';
import { WorldModelContext, RoutePlanDraft, RouteSegment } from '../shared/world-model.types';
import { FatigueCalculatorService, FatigueContext } from '../services/fatigue-calculator.service';
import { DayProfile, PaceConstraints } from '../interfaces/day-profile.interface';

@Injectable()
export class ObjectiveFunctionService implements IObjectiveFunction {
  private readonly logger = new Logger(ObjectiveFunctionService.name);
  
  private _weights: ObjectiveFunctionWeights;
  private _hardConstraints: Constraint[] = [];
  private _softConstraints: Constraint[] = [];

  constructor(
    private readonly fatigueCalculator: FatigueCalculatorService,
  ) {
    this._weights = { ...DEFAULT_OBJECTIVE_WEIGHTS };
    this.initializeDefaultConstraints();
  }

  get weights(): ObjectiveFunctionWeights {
    return { ...this._weights };
  }

  get hardConstraints(): Constraint[] {
    return [...this._hardConstraints];
  }

  get softConstraints(): Constraint[] {
    return [...this._softConstraints];
  }

  /**
   * 初始化默认约束
   */
  private initializeDefaultConstraints(): void {
    // 硬约束
    this._hardConstraints = [
      {
        id: 'HC_DEM_VIOLATION',
        type: 'DEM_VIOLATION',
        isHard: true,
        description: '地形硬违规（坡度/爬升超过人体极限）',
      },
      {
        id: 'HC_ROAD_CLOSED',
        type: 'ROAD_CLOSED',
        isHard: true,
        description: '道路完全关闭',
      },
      {
        id: 'HC_HAZARD_ZONE',
        type: 'HAZARD_ZONE',
        isHard: true,
        description: '高风险危险区域',
      },
      {
        id: 'HC_COMPLIANCE',
        type: 'COMPLIANCE_VIOLATION',
        isHard: true,
        description: '合规硬违规（缺少必要许可）',
      },
      {
        id: 'HC_ALTITUDE',
        type: 'ALTITUDE_LIMIT',
        isHard: true,
        description: '超过用户最大安全海拔',
      },
    ];

    // 软约束
    this._softConstraints = [
      {
        id: 'SC_FATIGUE',
        type: 'FATIGUE_THRESHOLD',
        isHard: false,
        description: '单日疲劳指数超过阈值',
        threshold: 1.4,
        penaltyFactor: 0.3,
      },
      {
        id: 'SC_ROLLING_ASCENT',
        type: 'ROLLING_ASCENT',
        isHard: false,
        description: '3天滚动爬升超过阈值',
        penaltyFactor: 0.25,
      },
      {
        id: 'SC_BUDGET',
        type: 'BUDGET_LIMIT',
        isHard: false,
        description: '预算超支',
        threshold: 1.2, // 允许超20%
        penaltyFactor: 0.15,
      },
      {
        id: 'SC_WEATHER',
        type: 'WEATHER_WARNING',
        isHard: false,
        description: '存在天气风险',
        penaltyFactor: 0.2,
      },
      {
        id: 'SC_PHILOSOPHY',
        type: 'PHILOSOPHY_DRIFT',
        isHard: false,
        description: '偏离路线哲学',
        threshold: 0.3, // 允许30%偏离
        penaltyFactor: 0.2,
      },
    ];
  }

  /**
   * 评估计划的总效用
   */
  evaluate(
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ObjectiveEvaluationResult {
    this.logger.debug(`[ObjectiveFunction] 评估计划: ${plan.tripId}`);

    // 1. 计算各维度分数
    const safetyScore = this.computeSafetyScore(plan, world);
    const experienceScore = this.computeExperienceScore(plan, world);
    const philosophyScore = this.computePhilosophyScore(plan, world);
    const timeSlackScore = this.computeTimeSlackScore(plan, world);
    const fatigueRiskPenalty = this.computeFatigueRiskPenalty(plan, world);
    const weatherRiskPenalty = this.computeWeatherRiskPenalty(plan, world);
    const budgetOverrunPenalty = this.computeBudgetOverrunPenalty(plan, world);
    const pacingVariancePenalty = this.computePacingVariancePenalty(plan, world);

    // 2. 加权计算
    const weightedScores = {
      safety: safetyScore * this._weights.safety,
      experience: experienceScore * this._weights.experienceDensity,
      philosophy: philosophyScore * this._weights.philosophyAlignment,
      timeSlack: timeSlackScore * this._weights.timeSlack,
      fatigue: fatigueRiskPenalty * this._weights.fatigueRisk,
      weather: weatherRiskPenalty * this._weights.weatherRisk,
      budget: budgetOverrunPenalty * this._weights.budgetOverrun,
      pacing: pacingVariancePenalty * this._weights.pacingVariance,
    };

    // 3. 计算总效用
    const positiveUtility = 
      weightedScores.safety + 
      weightedScores.experience + 
      weightedScores.philosophy + 
      weightedScores.timeSlack;
    
    const negativeUtility = 
      weightedScores.fatigue + 
      weightedScores.weather + 
      weightedScores.budget + 
      weightedScores.pacing;

    const totalUtility = Math.max(0, Math.min(1, positiveUtility - negativeUtility));

    // 4. 检查约束
    const constraintResults = this.checkConstraints(plan, world);
    const hardViolations = constraintResults.filter(
      c => this._hardConstraints.some(hc => hc.id === c.constraintId) && !c.satisfied
    );
    const softViolations = constraintResults.filter(
      c => this._softConstraints.some(sc => sc.id === c.constraintId) && !c.satisfied
    );

    const overallSatisfaction = constraintResults.length > 0
      ? constraintResults.reduce((sum, c) => sum + c.satisfactionScore, 0) / constraintResults.length
      : 1;

    const isFeasible = hardViolations.length === 0;

    // 5. 收集详细指标
    const metrics: Record<string, number> = {
      safetyScore,
      experienceScore,
      philosophyScore,
      timeSlackScore,
      fatigueRiskPenalty,
      weatherRiskPenalty,
      budgetOverrunPenalty,
      pacingVariancePenalty,
      positiveUtility,
      negativeUtility,
      hardViolationCount: hardViolations.length,
      softViolationCount: softViolations.length,
    };

    return {
      totalUtility,
      breakdown: {
        safetyScore,
        experienceScore,
        philosophyScore,
        timeSlackScore,
        fatigueRiskPenalty,
        weatherRiskPenalty,
        budgetOverrunPenalty,
        pacingVariancePenalty,
      },
      weightedScores,
      constraints: {
        hardViolations,
        softViolations,
        overallSatisfaction,
      },
      isFeasible,
      metrics,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * 计算单个维度的分数
   */
  computeDimensionScore(
    dimension: keyof ObjectiveFunctionWeights,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): number {
    switch (dimension) {
      case 'safety':
        return this.computeSafetyScore(plan, world);
      case 'experienceDensity':
        return this.computeExperienceScore(plan, world);
      case 'philosophyAlignment':
        return this.computePhilosophyScore(plan, world);
      case 'timeSlack':
        return this.computeTimeSlackScore(plan, world);
      case 'fatigueRisk':
        return this.computeFatigueRiskPenalty(plan, world);
      case 'weatherRisk':
        return this.computeWeatherRiskPenalty(plan, world);
      case 'budgetOverrun':
        return this.computeBudgetOverrunPenalty(plan, world);
      case 'pacingVariance':
        return this.computePacingVariancePenalty(plan, world);
      default:
        return 0;
    }
  }

  /**
   * 检查约束满足情况
   */
  checkConstraints(
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult[] {
    const results: ConstraintSatisfactionResult[] = [];

    // 检查硬约束
    for (const constraint of this._hardConstraints) {
      const result = this.checkSingleConstraint(constraint, plan, world);
      results.push(result);
    }

    // 检查软约束
    for (const constraint of this._softConstraints) {
      const result = this.checkSingleConstraint(constraint, plan, world);
      results.push(result);
    }

    return results;
  }

  /**
   * 检查单个约束
   */
  private checkSingleConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    switch (constraint.type) {
      case 'DEM_VIOLATION':
        return this.checkDEMConstraint(constraint, plan, world);
      case 'ROAD_CLOSED':
        return this.checkRoadConstraint(constraint, plan, world);
      case 'HAZARD_ZONE':
        return this.checkHazardConstraint(constraint, plan, world);
      case 'COMPLIANCE_VIOLATION':
        return this.checkComplianceConstraint(constraint, plan, world);
      case 'ALTITUDE_LIMIT':
        return this.checkAltitudeConstraint(constraint, plan, world);
      case 'FATIGUE_THRESHOLD':
        return this.checkFatigueConstraint(constraint, plan, world);
      case 'ROLLING_ASCENT':
        return this.checkRollingAscentConstraint(constraint, plan, world);
      case 'BUDGET_LIMIT':
        return this.checkBudgetConstraint(constraint, plan, world);
      case 'WEATHER_WARNING':
        return this.checkWeatherConstraint(constraint, plan, world);
      case 'PHILOSOPHY_DRIFT':
        return this.checkPhilosophyConstraint(constraint, plan, world);
      default:
        return {
          constraintId: constraint.id,
          satisfied: true,
          satisfactionScore: 1,
          violationDegree: 0,
        };
    }
  }

  // ========== 维度分数计算 ==========

  /**
   * 计算安全性分数 (Abu 主导)
   * 
   * 考虑因素：
   * - DEM 违规情况
   * - 道路状态
   * - 危险区域
   * - 合规性
   */
  private computeSafetyScore(plan: RoutePlanDraft, world: WorldModelContext): number {
    let score = 1.0;

    const physical = world.physical;

    // 1. DEM 违规惩罚
    const demViolations = physical.demEvidence.filter(
      e => e.violation !== 'NONE' && !e.segmentId.includes('placeholder')
    );
    const hardDemViolations = demViolations.filter(e => e.violation === 'HARD');
    const softDemViolations = demViolations.filter(e => e.violation === 'SOFT');

    if (hardDemViolations.length > 0) {
      score -= 0.5; // 硬违规大幅扣分
    }
    score -= softDemViolations.length * 0.1; // 软违规小幅扣分

    // 2. 道路状态惩罚
    const closedRoads = physical.roadStates.filter(r => r.status === 'CLOSED');
    const restrictedRoads = physical.roadStates.filter(r => r.status === 'RESTRICTED' || r.status === 'SEASONAL');
    
    score -= closedRoads.length * 0.3;
    score -= restrictedRoads.length * 0.1;

    // 3. 危险区域惩罚
    const highRiskHazards = physical.hazardZones.filter(
      h => h.level === 'HIGH' && 
           (h.seasonality?.highRiskMonths?.includes(physical.month) ?? false)
    );
    const mediumRiskHazards = physical.hazardZones.filter(
      h => h.level === 'MEDIUM'
    );

    score -= highRiskHazards.length * 0.4;
    score -= mediumRiskHazards.length * 0.1;

    // 4. 合规性惩罚
    const complianceViolations = (world.complianceEvidence || []).filter(
      c => c.violation !== 'NONE'
    );
    score -= complianceViolations.length * 0.2;

    // 5. 气候可达性
    if (physical.climateSeasonality) {
      const accessibilityScore = physical.climateSeasonality.accessibilityScore;
      if (accessibilityScore < 0.5) {
        score -= (0.5 - accessibilityScore) * 0.4;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算体验密度分数
   * 
   * 考虑因素：
   * - POI 覆盖率
   * - 体验质量
   * - 时间利用率
   */
  private computeExperienceScore(plan: RoutePlanDraft, world: WorldModelContext): number {
    let score = 0.7; // 基础分

    // 1. 路段数量（体验密度）
    const segmentCount = plan.segments.length;
    const daysCount = new Set(plan.segments.map(s => s.dayIndex)).size;
    const avgSegmentsPerDay = daysCount > 0 ? segmentCount / daysCount : 0;

    // 理想密度：每天 3-5 段
    if (avgSegmentsPerDay >= 3 && avgSegmentsPerDay <= 5) {
      score += 0.2;
    } else if (avgSegmentsPerDay >= 2 && avgSegmentsPerDay <= 6) {
      score += 0.1;
    }

    // 2. 路线哲学中的核心体验覆盖
    const philosophy = world.routeDirection.philosophy;
    if (philosophy && typeof philosophy === 'object') {
      // 检查是否覆盖核心体验
      score += 0.1; // 简化处理
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算路线哲学匹配度分数 (Neptune 主导)
   */
  private computePhilosophyScore(plan: RoutePlanDraft, world: WorldModelContext): number {
    let score = 0.8; // 基础分

    const routeDirection = world.routeDirection;

    // 1. 检查是否使用了正确的 RouteDirection
    if (plan.routeDirectionId === routeDirection.id) {
      score += 0.1;
    }

    // 2. 检查约束遵守情况
    const constraints = routeDirection.constraints;
    if (constraints) {
      // 硬约束遵守
      const hardConstraints = constraints.hard || {};
      // 这里简化处理，实际需要检查每个硬约束
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算时间余量分数
   */
  private computeTimeSlackScore(plan: RoutePlanDraft, world: WorldModelContext): number {
    // 计算每天的时间余量
    const dayProfiles = this.buildDayProfiles(plan, world);
    
    let totalSlack = 0;
    for (const day of dayProfiles) {
      // 假设一天有效时间 10 小时
      const availableHours = 10;
      const usedHours = day.estMovingHours;
      const slack = Math.max(0, availableHours - usedHours);
      totalSlack += slack;
    }

    const avgSlack = dayProfiles.length > 0 ? totalSlack / dayProfiles.length : 0;
    
    // 理想余量：2-4 小时
    if (avgSlack >= 2 && avgSlack <= 4) {
      return 1.0;
    } else if (avgSlack >= 1 && avgSlack <= 5) {
      return 0.8;
    } else if (avgSlack < 1) {
      return 0.5 + avgSlack * 0.3;
    } else {
      return 0.7; // 余量太多，效率偏低
    }
  }

  /**
   * 计算疲劳风险惩罚 (Dre 主导)
   */
  private computeFatigueRiskPenalty(plan: RoutePlanDraft, world: WorldModelContext): number {
    const dayProfiles = this.buildDayProfiles(plan, world);
    
    let totalPenalty = 0;
    let severeDays = 0;
    let overloadedDays = 0;

    for (const day of dayProfiles) {
      if (day.fatigueIndex > 1.4) {
        severeDays++;
        totalPenalty += 0.3;
      } else if (day.fatigueIndex > 1.1) {
        overloadedDays++;
        totalPenalty += 0.15;
      }
    }

    // 归一化
    const avgPenalty = dayProfiles.length > 0 
      ? totalPenalty / dayProfiles.length 
      : 0;

    return Math.min(1, avgPenalty);
  }

  /**
   * 计算天气风险惩罚
   */
  private computeWeatherRiskPenalty(plan: RoutePlanDraft, world: WorldModelContext): number {
    const physical = world.physical;
    
    // 基于气候可达性
    if (physical.climateSeasonality) {
      const accessibilityScore = physical.climateSeasonality.accessibilityScore;
      return Math.max(0, 1 - accessibilityScore);
    }

    return 0.2; // 默认中等风险
  }

  /**
   * 计算预算超支惩罚
   */
  private computeBudgetOverrunPenalty(plan: RoutePlanDraft, world: WorldModelContext): number {
    // Phase 1 简化：暂无预算数据
    return 0;
  }

  /**
   * 计算节奏方差惩罚
   */
  private computePacingVariancePenalty(plan: RoutePlanDraft, world: WorldModelContext): number {
    const dayProfiles = this.buildDayProfiles(plan, world);
    
    if (dayProfiles.length < 2) {
      return 0;
    }

    // 计算疲劳指数的方差
    const fatigueIndices = dayProfiles.map(d => d.fatigueIndex);
    const mean = fatigueIndices.reduce((a, b) => a + b, 0) / fatigueIndices.length;
    const variance = fatigueIndices.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / fatigueIndices.length;
    const stdDev = Math.sqrt(variance);

    // 标准差越大，惩罚越高
    // 理想标准差 < 0.2
    if (stdDev < 0.2) {
      return 0;
    } else if (stdDev < 0.4) {
      return (stdDev - 0.2) / 0.2 * 0.5;
    } else {
      return 0.5 + (stdDev - 0.4) * 0.5;
    }
  }

  // ========== 约束检查实现 ==========

  private checkDEMConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const violations = world.physical.demEvidence.filter(
      e => e.violation === 'HARD' && !e.segmentId.includes('placeholder')
    );

    return {
      constraintId: constraint.id,
      satisfied: violations.length === 0,
      satisfactionScore: violations.length === 0 ? 1 : 0,
      violationDegree: violations.length,
      violationExplanation: violations.length > 0 
        ? `发现 ${violations.length} 处 DEM 硬违规` 
        : undefined,
      repairSuggestion: violations.length > 0 
        ? '需要重新规划路线，避开陡峭路段' 
        : undefined,
    };
  }

  private checkRoadConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const closedRoads = world.physical.roadStates.filter(r => r.status === 'CLOSED');

    return {
      constraintId: constraint.id,
      satisfied: closedRoads.length === 0,
      satisfactionScore: closedRoads.length === 0 ? 1 : 0,
      violationDegree: closedRoads.length,
      violationExplanation: closedRoads.length > 0 
        ? `${closedRoads.length} 条道路关闭` 
        : undefined,
    };
  }

  private checkHazardConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const physical = world.physical;
    const highRiskHazards = physical.hazardZones.filter(
      h => h.level === 'HIGH' && 
           (h.seasonality?.highRiskMonths?.includes(physical.month) ?? false)
    );

    return {
      constraintId: constraint.id,
      satisfied: highRiskHazards.length === 0,
      satisfactionScore: highRiskHazards.length === 0 ? 1 : 0,
      violationDegree: highRiskHazards.length,
      violationExplanation: highRiskHazards.length > 0 
        ? `存在 ${highRiskHazards.length} 个高风险区域` 
        : undefined,
    };
  }

  private checkComplianceConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const violations = (world.complianceEvidence || []).filter(
      c => c.violation === 'HARD'
    );

    return {
      constraintId: constraint.id,
      satisfied: violations.length === 0,
      satisfactionScore: violations.length === 0 ? 1 : 0,
      violationDegree: violations.length,
    };
  }

  private checkAltitudeConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const human = world.human;
    const maxUserAltitude = human.maxElevationM || 6000;
    
    // 从 DEM 证据中获取最高海拔
    let maxRouteAltitude = 0;
    for (const dem of world.physical.demEvidence) {
      if (dem.metadata?.elevationRange?.max) {
        maxRouteAltitude = Math.max(maxRouteAltitude, dem.metadata.elevationRange.max);
      }
    }

    const satisfied = maxRouteAltitude <= maxUserAltitude;

    return {
      constraintId: constraint.id,
      satisfied,
      satisfactionScore: satisfied ? 1 : Math.max(0, 1 - (maxRouteAltitude - maxUserAltitude) / 1000),
      violationDegree: satisfied ? 0 : maxRouteAltitude - maxUserAltitude,
      violationExplanation: !satisfied 
        ? `路线最高海拔 ${maxRouteAltitude}m 超过用户限制 ${maxUserAltitude}m` 
        : undefined,
    };
  }

  private checkFatigueConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const dayProfiles = this.buildDayProfiles(plan, world);
    const threshold = constraint.threshold || 1.4;
    
    const overloadedDays = dayProfiles.filter(d => d.fatigueIndex > threshold);
    const maxFatigue = dayProfiles.length > 0 
      ? Math.max(...dayProfiles.map(d => d.fatigueIndex)) 
      : 0;

    const satisfied = overloadedDays.length === 0;
    const satisfactionScore = satisfied 
      ? 1 
      : Math.max(0, 1 - (maxFatigue - threshold) / threshold);

    return {
      constraintId: constraint.id,
      satisfied,
      satisfactionScore,
      violationDegree: overloadedDays.length,
      violationExplanation: !satisfied 
        ? `${overloadedDays.length} 天疲劳指数超过阈值 ${threshold}` 
        : undefined,
      repairSuggestion: !satisfied 
        ? '建议拆分高负荷天或插入休息日' 
        : undefined,
    };
  }

  private checkRollingAscentConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const dayProfiles = this.buildDayProfiles(plan, world);
    const human = world.human;
    const threshold = human.rollingAscent3DaysM;
    
    let maxRolling = 0;
    for (let i = 0; i < dayProfiles.length - 2; i++) {
      const rolling = dayProfiles.slice(i, i + 3)
        .reduce((sum, d) => sum + d.totalAscentM, 0);
      maxRolling = Math.max(maxRolling, rolling);
    }

    const satisfied = maxRolling <= threshold;
    const satisfactionScore = satisfied 
      ? 1 
      : Math.max(0, 1 - (maxRolling - threshold) / threshold);

    return {
      constraintId: constraint.id,
      satisfied,
      satisfactionScore,
      violationDegree: satisfied ? 0 : maxRolling - threshold,
      violationExplanation: !satisfied 
        ? `3天滚动爬升 ${maxRolling}m 超过阈值 ${threshold}m` 
        : undefined,
    };
  }

  private checkBudgetConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    // Phase 1 简化：暂无预算数据
    return {
      constraintId: constraint.id,
      satisfied: true,
      satisfactionScore: 1,
      violationDegree: 0,
    };
  }

  private checkWeatherConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    const physical = world.physical;
    const accessibilityScore = physical.climateSeasonality?.accessibilityScore ?? 0.7;

    const satisfied = accessibilityScore >= 0.5;
    
    return {
      constraintId: constraint.id,
      satisfied,
      satisfactionScore: accessibilityScore,
      violationDegree: satisfied ? 0 : 0.5 - accessibilityScore,
      violationExplanation: !satisfied 
        ? `当前月份可达性评分较低 (${accessibilityScore.toFixed(2)})` 
        : undefined,
    };
  }

  private checkPhilosophyConstraint(
    constraint: Constraint,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult {
    // Phase 1 简化：检查是否使用正确的 RouteDirection
    const routeMatch = plan.routeDirectionId === world.routeDirection.id;

    return {
      constraintId: constraint.id,
      satisfied: routeMatch,
      satisfactionScore: routeMatch ? 1 : 0.5,
      violationDegree: routeMatch ? 0 : 0.5,
      violationExplanation: !routeMatch 
        ? '计划与选定的路线方向不匹配' 
        : undefined,
    };
  }

  /**
   * 更新权重
   */
  updateWeights(newWeights: Partial<ObjectiveFunctionWeights>): void {
    this._weights = {
      ...this._weights,
      ...newWeights,
    };
    
    // 归一化（确保总和为 1）
    this.normalizeWeights();
    
    this.logger.log(`[ObjectiveFunction] 权重已更新: ${JSON.stringify(this._weights)}`);
  }

  /**
   * 归一化权重
   */
  private normalizeWeights(): void {
    const sum = Object.values(this._weights).reduce((a, b) => a + b, 0);
    if (sum > 0 && Math.abs(sum - 1) > 0.01) {
      for (const key of Object.keys(this._weights) as (keyof ObjectiveFunctionWeights)[]) {
        this._weights[key] = this._weights[key] / sum;
      }
    }
  }

  /**
   * 比较多个候选方案
   */
  compareCandidates(
    candidates: RoutePlanDraft[],
    world: WorldModelContext
  ): CandidateComparisonResult {
    const evaluations = candidates.map(c => this.evaluate(c, world));
    
    // 按总效用排序
    const ranking = evaluations
      .map((e, i) => ({ index: i, utility: e.totalUtility }))
      .sort((a, b) => b.utility - a.utility)
      .map(e => e.index);

    const bestIndex = ranking[0];

    // 生成权衡分析
    const pairwise: CandidateComparisonResult['tradeoffAnalysis']['pairwise'] = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const evalA = evaluations[i];
        const evalB = evaluations[j];
        
        const advantagesA: string[] = [];
        const advantagesB: string[] = [];

        if (evalA.breakdown.safetyScore > evalB.breakdown.safetyScore) {
          advantagesA.push('更安全');
        } else if (evalA.breakdown.safetyScore < evalB.breakdown.safetyScore) {
          advantagesB.push('更安全');
        }

        if (evalA.breakdown.experienceScore > evalB.breakdown.experienceScore) {
          advantagesA.push('体验更丰富');
        } else if (evalA.breakdown.experienceScore < evalB.breakdown.experienceScore) {
          advantagesB.push('体验更丰富');
        }

        if (evalA.breakdown.fatigueRiskPenalty < evalB.breakdown.fatigueRiskPenalty) {
          advantagesA.push('更轻松');
        } else if (evalA.breakdown.fatigueRiskPenalty > evalB.breakdown.fatigueRiskPenalty) {
          advantagesB.push('更轻松');
        }

        pairwise.push({
          indexA: i,
          indexB: j,
          advantagesA,
          advantagesB,
          recommendation: evalA.totalUtility > evalB.totalUtility ? 'A' 
            : evalA.totalUtility < evalB.totalUtility ? 'B' 
            : 'EQUAL',
        });
      }
    }

    return {
      bestIndex,
      evaluations,
      ranking,
      tradeoffAnalysis: { pairwise },
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 构建每日画像
   */
  private buildDayProfiles(
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): DayProfile[] {
    const pace = this.buildPaceConstraints(world);
    const daysMap = new Map<number, RouteSegment[]>();
    
    for (const seg of plan.segments) {
      const list = daysMap.get(seg.dayIndex) ?? [];
      list.push(seg);
      daysMap.set(seg.dayIndex, list);
    }

    return Array.from(daysMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([dayIndex, segments]) => {
        const totalDistanceKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
        const totalAscentM = segments.reduce((s, seg) => s + seg.ascentM, 0);
        const maxSlopePct = segments.reduce(
          (m, seg) => Math.max(m, seg.slopePct ?? 0),
          0
        );
        const estMovingHours = this.fatigueCalculator.estimateMovingHours(
          totalDistanceKm,
          totalAscentM
        );

        const dp: DayProfile = {
          dayIndex,
          segments,
          totalDistanceKm,
          totalAscentM,
          maxSlopePct,
          estMovingHours,
          fatigueIndex: 0,
        };

        dp.fatigueIndex = this.fatigueCalculator.computeFatigueIndex(dp, pace);
        return dp;
      });
  }

  /**
   * 构建节奏约束
   */
  private buildPaceConstraints(world: WorldModelContext): PaceConstraints {
    const human = world.human;
    const softConstraints = world.routeDirection.constraints?.soft || {};

    return {
      maxDailyAscentM: Math.min(
        human.maxDailyAscentM,
        softConstraints.maxDailyAscentM || Infinity
      ),
      maxDailyDistanceKm: human.preferredPace === 'SLOW' ? 18 
        : human.preferredPace === 'FAST' ? 24 
        : 22,
      maxMovingHours: human.preferredPace === 'SLOW' ? 7 
        : human.preferredPace === 'FAST' ? 10 
        : 9,
      rollingAscent3DaysM: human.rollingAscent3DaysM,
    };
  }
}
