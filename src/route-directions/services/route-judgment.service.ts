// src/route-directions/services/route-judgment.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RouteExistenceJudgment,
  FeasibilityJudgment,
  TimelinessJudgment,
  MatchingJudgment,
  RouteContext,
  UserProfile,
  FeasibilityLevel,
  TimelinessLevel,
  MatchingLevel,
  RouteExistenceStatus,
} from '../interfaces/route-judgment.interface';
import { RouteDirectionData } from '../interfaces/route-direction.interface';

/**
 * 路线判断服务
 * 
 * 判断路线是否存在（应该被呈现）：
 * - 问题一：这条路线物理上能不能走？（可行性）
 * - 问题二：这条路线当前状态下适不适合走？（适时性）
 * - 问题三：这条路线对这个用户合不合适？（匹配性）
 */
@Injectable()
export class RouteJudgmentService {
  private readonly logger = new Logger(RouteJudgmentService.name);

  /**
   * 判断路线是否存在（应该被推荐）
   */
  async judgeRouteExistence(
    route: RouteDirectionData,
    context: RouteContext,
    user: UserProfile,
  ): Promise<RouteExistenceJudgment> {
    this.logger.log(`Judging route existence for ${route.id || route.name}`);

    // 问题一：这条路线物理上能不能走？
    const feasibility = await this.assessFeasibility(route, context);

    // 问题二：这条路线当前状态下适不适合走？
    const timeliness = await this.assessTimeliness(route, context);

    // 问题三：这条路线对这个用户合不合适？
    const matching = await this.assessMatching(route, user);

    // 综合判断
    const existence = this.combineJudgments(feasibility, timeliness, matching);

    // 生成解释
    const explanation = this.generateExistenceExplanation(feasibility, timeliness, matching);

    return {
      feasibility,
      timeliness,
      matching,
      existence,
      explanation,
    };
  }

  /**
   * 可行性判断
   */
  private async assessFeasibility(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<FeasibilityJudgment> {
    // 检查地理可达性
    const accessibility = await this.checkAccessibility(route);

    // 检查时间可行性
    const timeFeasibility = await this.checkTimeFeasibility(route, context);

    // 检查交通可用性
    const transportAvailability = await this.checkTransportAvailability(route, context);

    // 检查准入条件
    const admissionRequirements = await this.checkAdmissionRequirements(route);

    // 判断可行性等级
    let feasibilityLevel: FeasibilityLevel = '完全可行';

    if (!accessibility.available || !transportAvailability.available) {
      feasibilityLevel = '不可行';
    } else if (admissionRequirements.requiresPermit && !admissionRequirements.permitObtained) {
      feasibilityLevel = '有条件可行';
    } else if (timeFeasibility.tight) {
      feasibilityLevel = '困难';
    }

    return {
      level: feasibilityLevel,
      accessibility,
      timeFeasibility,
      transportAvailability,
      admissionRequirements,
    };
  }

  /**
   * 适时性判断
   */
  private async assessTimeliness(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<TimelinessJudgment> {
    // 检查季节因素
    const seasonFit = await this.checkSeasonFit(route, context);

    // 检查天气状态
    const weatherFit = await this.checkWeatherFit(route, context);

    // 检查人流密度
    const crowdFit = await this.checkCrowdFit(route, context);

    // 检查特殊事件
    const eventImpact = await this.checkEventImpact(route, context);

    // 判断适时性等级
    let timelinessLevel: TimelinessLevel = '可接受';

    if (weatherFit.hasWarning) {
      timelinessLevel = '警告';
    } else if (seasonFit.bad && crowdFit.veryHigh) {
      timelinessLevel = '不建议';
    } else if (seasonFit.best && weatherFit.good && crowdFit.normal) {
      timelinessLevel = '最佳时机';
    } else if (seasonFit.good && weatherFit.ok) {
      timelinessLevel = '合适时机';
    }

    return {
      level: timelinessLevel,
      seasonFit,
      weatherFit,
      crowdFit,
      eventImpact,
    };
  }

  /**
   * 匹配性判断
   */
  private async assessMatching(
    route: RouteDirectionData,
    user: UserProfile,
  ): Promise<MatchingJudgment> {
    // 体力匹配
    const physicalMatch = await this.matchPhysical(route, user);

    // 经验匹配
    const experienceMatch = await this.matchExperience(route, user);

    // 时间匹配
    const timeMatch = await this.matchTime(route, user);

    // 预算匹配
    const budgetMatch = await this.matchBudget(route, user);

    // 偏好匹配
    const preferenceMatch = await this.matchPreference(route, user);

    // 判断匹配性等级
    const matchScores = [
      physicalMatch.score,
      experienceMatch.score,
      timeMatch.score,
      budgetMatch.score,
      preferenceMatch.score,
    ];

    const avgScore = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;

    let overallMatch: MatchingLevel;
    if (avgScore >= 0.85) {
      overallMatch = '高度匹配';
    } else if (avgScore >= 0.7) {
      overallMatch = '基本匹配';
    } else if (avgScore >= 0.55) {
      overallMatch = '部分匹配';
    } else {
      overallMatch = '不匹配';
    }

    return {
      overallMatch,
      physicalMatch,
      experienceMatch,
      timeMatch,
      budgetMatch,
      preferenceMatch,
    };
  }

  // ========== 可行性检查方法 ==========

  /**
   * 检查地理可达性
   */
  private async checkAccessibility(_route: RouteDirectionData): Promise<{
    available: boolean;
    explanation: string;
    limitations?: string[];
  }> {
    // 简化实现：假设路线可达
    // 实际应该检查路线是否存在、是否开放等
    return {
      available: true,
      explanation: '路线地理上可达',
    };
  }

  /**
   * 检查时间可行性
   */
  private async checkTimeFeasibility(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<{
    feasible: boolean;
    tight: boolean;
    explanation: string;
  }> {
    // 从metadata或extensions中获取路线时长
    const routeDuration =
      route.metadata?.estimatedDuration ||
      route.extensions?.estimatedDuration ||
      route.metadata?.durationDays ||
      0;
    const travelDays = context.travelDates
      ? Math.ceil(
          (context.travelDates.end.getTime() - context.travelDates.start.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 7;

    const feasible = routeDuration <= travelDays || routeDuration === 0;
    const tight = routeDuration > 0 && routeDuration > travelDays * 0.8;

    return {
      feasible,
      tight,
      explanation: routeDuration === 0
        ? '路线时长未指定'
        : feasible
          ? `路线时长${routeDuration}天，你有${travelDays}天，时间${tight ? '较紧' : '充足'}`
          : `路线时长${routeDuration}天，你只有${travelDays}天，时间不足`,
    };
  }

  /**
   * 检查交通可用性
   */
  private async checkTransportAvailability(
    _route: RouteDirectionData,
    _context: RouteContext,
  ): Promise<{
    available: boolean;
    methods: string[];
    explanation: string;
  }> {
    // 简化实现
    return {
      available: true,
      methods: ['自驾', '公共交通'],
      explanation: '交通方式可用',
    };
  }

  /**
   * 检查准入要求
   */
  private async checkAdmissionRequirements(route: RouteDirectionData): Promise<{
    requiresPermit: boolean;
    permitObtained: boolean;
    otherRequirements?: string[];
  }> {
    const constraints = route.constraints || {};
    const requiresPermit = constraints.requiresPermit || false;

    return {
      requiresPermit,
      permitObtained: false, // 默认未获得许可
      otherRequirements: constraints.otherRequirements || [],
    };
  }

  // ========== 适时性检查方法 ==========

  /**
   * 检查季节匹配
   */
  private async checkSeasonFit(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<{
    best: boolean;
    good: boolean;
    ok: boolean;
    bad: boolean;
    explanation: string;
  }> {
    const seasonality = route.seasonality || {};
    const currentMonth = context.currentDate.getMonth() + 1;
    const bestMonths = seasonality.bestMonths || [];
    const avoidMonths = seasonality.avoidMonths || [];

    const best = bestMonths.includes(currentMonth);
    const good = bestMonths.some((m: number) => Math.abs(m - currentMonth) <= 1);
    const bad = avoidMonths.includes(currentMonth);
    const ok = !best && !good && !bad;

    return {
      best,
      good,
      ok,
      bad,
      explanation: best
        ? '当前处于最佳旅行季节'
        : good
          ? '当前处于良好旅行季节'
          : bad
            ? '当前不是推荐的旅行季节'
            : '当前季节可接受',
    };
  }

  /**
   * 检查天气匹配
   */
  private async checkWeatherFit(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<{
    good: boolean;
    ok: boolean;
    hasWarning: boolean;
    explanation: string;
  }> {
    // 简化实现：根据天气信息判断
    const weather = context.weather || {};
    const hasWarning = weather.hasWarning || false;
    const good = weather.condition === 'good';
    const ok = weather.condition === 'ok' || !hasWarning;

    return {
      good,
      ok,
      hasWarning,
      explanation: hasWarning
        ? '当前天气状况有警告'
        : good
          ? '当前天气状况良好'
          : '当前天气状况可接受',
    };
  }

  /**
   * 检查人流匹配
   */
  private async checkCrowdFit(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<{
    normal: boolean;
    veryHigh: boolean;
    explanation: string;
  }> {
    const crowd = context.crowd || {};
    const veryHigh = crowd.level === 'VERY_HIGH';
    const normal = crowd.level === 'NORMAL' || crowd.level === 'LOW';

    return {
      normal,
      veryHigh,
      explanation: veryHigh
        ? '当前人流密度很高'
        : normal
          ? '当前人流密度正常'
          : '当前人流密度较高',
    };
  }

  /**
   * 检查事件影响
   */
  private async checkEventImpact(
    route: RouteDirectionData,
    context: RouteContext,
  ): Promise<{
    hasImpact: boolean;
    impactType?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    explanation: string;
  }> {
    const events = context.events || [];
    const hasImpact = events.length > 0;

    return {
      hasImpact,
      impactType: hasImpact ? 'NEUTRAL' : undefined,
      explanation: hasImpact
        ? `当前有${events.length}个相关事件可能影响路线`
        : '当前没有特殊事件影响',
    };
  }

  // ========== 匹配性检查方法 ==========

  /**
   * 体力匹配
   */
  private async matchPhysical(
    route: RouteDirectionData,
    user: UserProfile,
  ): Promise<{ score: number; explanation: string }> {
    // 从metadata或constraints中获取路线体力要求
    const routeFitness =
      route.metadata?.minFitnessLevel ||
      route.constraints?.metadata?.minFitnessLevel ||
      5;
    const userFitness = user.fitnessLevel || 5;
    const diff = Math.abs(routeFitness - userFitness);

    let score = 1 - diff / 10; // 差异越小，分数越高
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      explanation:
        diff <= 1
          ? '体力要求匹配'
          : routeFitness > userFitness
            ? `路线体力要求略高于你的水平（${routeFitness} vs ${userFitness}）`
            : `路线体力要求低于你的水平（${routeFitness} vs ${userFitness}）`,
    };
  }

  /**
   * 经验匹配
   */
  private async matchExperience(
    route: RouteDirectionData,
    user: UserProfile,
  ): Promise<{ score: number; explanation: string }> {
    // 从metadata或constraints中获取路线难度
    const routeFitness =
      route.metadata?.minFitnessLevel ||
      route.constraints?.metadata?.minFitnessLevel ||
      5;
    const routeDifficulty = this.mapDifficultyToNumber(routeFitness);
    const userExperience = user.experienceLevel || 5;
    const diff = Math.abs(routeDifficulty - userExperience);

    let score = 1 - diff / 10;
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      explanation:
        diff <= 1
          ? '难度与经验匹配'
          : routeDifficulty > userExperience
            ? `路线难度高于你的经验水平`
            : `路线难度低于你的经验水平`,
    };
  }

  /**
   * 时间匹配
   */
  private async matchTime(
    route: RouteDirectionData,
    user: UserProfile,
  ): Promise<{ score: number; explanation: string }> {
    const routeDuration =
      route.metadata?.estimatedDuration ||
      route.extensions?.estimatedDuration ||
      route.metadata?.durationDays ||
      0;
    const availableDays = user.availableDays || 7;
    
    if (routeDuration === 0) {
      return {
        score: 0.7, // 默认中等匹配
        explanation: '路线时长未指定，无法精确匹配',
      };
    }

    const ratio = routeDuration / availableDays;

    let score: number;
    if (ratio <= 0.8) {
      score = 1.0;
    } else if (ratio <= 1.0) {
      score = 0.8;
    } else if (ratio <= 1.2) {
      score = 0.5;
    } else {
      score = 0.2;
    }

    return {
      score,
      explanation:
        ratio <= 0.8
          ? '时间充足'
          : ratio <= 1.0
            ? '时间较紧但可行'
            : '时间不足',
    };
  }

  /**
   * 预算匹配
   */
  private async matchBudget(
    route: RouteDirectionData,
    user: UserProfile,
  ): Promise<{ score: number; explanation: string }> {
    const routeCost =
      route.metadata?.estimatedCost ||
      route.extensions?.estimatedCost ||
      0;
    const budget = user.budget || 10000;
    
    if (routeCost === 0) {
      return {
        score: 0.7, // 默认中等匹配
        explanation: '路线费用未指定，无法精确匹配',
      };
    }

    const ratio = routeCost / budget;

    let score: number;
    if (ratio <= 0.8) {
      score = 1.0;
    } else if (ratio <= 1.0) {
      score = 0.8;
    } else if (ratio <= 1.2) {
      score = 0.5;
    } else {
      score = 0.2;
    }

    return {
      score,
      explanation:
        ratio <= 0.8
          ? '预算充足'
          : ratio <= 1.0
            ? '预算略紧但可行'
            : '预算不足',
    };
  }

  /**
   * 偏好匹配
   */
  private async matchPreference(
    route: RouteDirectionData,
    user: UserProfile,
  ): Promise<{ score: number; explanation: string }> {
    // 简化实现：基于路线标签和用户偏好匹配
    const routeTags = route.tags || [];
    const userPreferences = user.preferences || {};
    const preferredTags = userPreferences.tags || [];

    if (preferredTags.length === 0) {
      return {
        score: 0.7, // 默认中等匹配
        explanation: '未指定偏好，使用默认匹配度',
      };
    }

    const matchCount = routeTags.filter(tag => preferredTags.includes(tag)).length;
    const score = matchCount / Math.max(preferredTags.length, routeTags.length);

    return {
      score,
      explanation:
        matchCount > 0
          ? `路线包含${matchCount}个你偏好的标签`
          : '路线标签与你的偏好不匹配',
    };
  }

  // ========== 综合判断方法 ==========

  /**
   * 综合判断
   */
  private combineJudgments(
    feasibility: FeasibilityJudgment,
    timeliness: TimelinessJudgment,
    matching: MatchingJudgment,
  ): RouteExistenceJudgment['existence'] {
    // 绝对否决条件
    if (feasibility.level === '不可行') {
      return {
        status: 'NOT_EXISTS',
        reason: '路线物理上不可行',
        evidence: [
          feasibility.accessibility.explanation,
          feasibility.transportAvailability.explanation,
        ],
        score: 0,
      };
    }

    if (timeliness.level === '警告') {
      return {
        status: 'NOT_EXISTS',
        reason: '当前状态不适合走这条路线',
        evidence: [timeliness.weatherFit.explanation],
        score: 0.2,
      };
    }

    // 计算综合评分
    const feasibilityScore = this.mapFeasibilityToScore(feasibility.level);
    const timelinessScore = this.mapTimelinessToScore(timeliness.level);
    const matchingScore = this.calculateMatchingScore(matching);

    // 加权平均
    const overallScore =
      feasibilityScore * 0.4 + timelinessScore * 0.3 + matchingScore * 0.3;

    // 判断存在状态
    let status: RouteExistenceStatus;
    if (overallScore >= 0.8) {
      status = 'EXISTS';
    } else if (overallScore >= 0.5) {
      status = 'CONDITIONAL_EXISTS';
    } else {
      status = 'NOT_EXISTS';
    }

    const reasons: string[] = [];
    if (feasibility.level !== '完全可行') {
      reasons.push(`可行性：${feasibility.level}`);
    }
    if (timeliness.level !== '最佳时机' && timeliness.level !== '合适时机') {
      reasons.push(`适时性：${timeliness.level}`);
    }
    if (matching.overallMatch !== '高度匹配' && matching.overallMatch !== '基本匹配') {
      reasons.push(`匹配性：${matching.overallMatch}`);
    }

    return {
      status,
      reason: reasons.length > 0 ? reasons.join('；') : '路线存在且适合',
      evidence: [
        feasibility.accessibility.explanation,
        timeliness.seasonFit.explanation,
        matching.physicalMatch.explanation,
      ],
      score: overallScore,
    };
  }

  /**
   * 生成存在性解释
   */
  private generateExistenceExplanation(
    feasibility: FeasibilityJudgment,
    timeliness: TimelinessJudgment,
    matching: MatchingJudgment,
  ): string {
    const parts: string[] = [];

    parts.push(`可行性：${feasibility.level}`);
    parts.push(`适时性：${timeliness.level}`);
    parts.push(`匹配性：${matching.overallMatch}`);

    return parts.join('；');
  }

  // ========== 辅助方法 ==========

  /**
   * 映射可行性到评分
   */
  private mapFeasibilityToScore(level: FeasibilityLevel): number {
    const mapping: Record<FeasibilityLevel, number> = {
      完全可行: 1.0,
      有条件可行: 0.7,
      困难: 0.4,
      不可行: 0.0,
    };
    return mapping[level] || 0.5;
  }

  /**
   * 映射适时性到评分
   */
  private mapTimelinessToScore(level: TimelinessLevel): number {
    const mapping: Record<TimelinessLevel, number> = {
      最佳时机: 1.0,
      合适时机: 0.8,
      可接受: 0.6,
      不建议: 0.3,
      警告: 0.1,
    };
    return mapping[level] || 0.5;
  }

  /**
   * 计算匹配性评分
   */
  private calculateMatchingScore(matching: MatchingJudgment): number {
    const scores = [
      matching.physicalMatch.score,
      matching.experienceMatch.score,
      matching.timeMatch.score,
      matching.budgetMatch.score,
      matching.preferenceMatch.score,
    ];
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * 映射难度到数字
   */
  private mapDifficultyToNumber(fitnessLevel: number): number {
    if (fitnessLevel <= 3) return 3;
    if (fitnessLevel <= 5) return 5;
    if (fitnessLevel <= 7) return 7;
    return 9;
  }
}
