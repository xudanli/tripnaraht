// src/trips/decision/services/dem-decision-evidence.service.ts
/**
 * DEM 决策证据服务
 * 
 * PART 2: DEM 从"算高度"→"算决策"
 * 
 * DEM 必须成为「第一类否决者」
 * - 没有 DEM evidence 的 plan 不允许 finalize
 * - Neptune 不能修复没有 DEM 证据的路径
 * 
 * 核心功能：
 * 1. 生成 DEM 决策证据（每个段）
 * 2. 强制「连续日疲劳检测」（rolling window 3天）
 * 3. 走廊质量评分（viewExposure + elevationVariance - slopePenalty）
 * 4. 可解释失败原因
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlanDay, TripPlan } from '../plan-model';
import { RouteDirectionData, HardConstraints, SoftConstraints } from '../../../route-directions/interfaces/route-direction.interface';
import { DEMRouteSegmentationService, RouteSegmentation } from './dem-route-segmentation.service';
import { DEMDailyEnergyService } from './dem-daily-energy.service';
import {
  DemDecisionEvidence,
  RollingFatigueDetection,
  CorridorQualityScore,
  DemEvidencePipelineResult,
} from '../interfaces/dem-decision-evidence.interface';

@Injectable()
export class DemDecisionEvidenceService {
  private readonly logger = new Logger(DemDecisionEvidenceService.name);

  constructor(
    private readonly demRouteSegmentationService: DEMRouteSegmentationService,
    private readonly demDailyEnergyService: DEMDailyEnergyService,
  ) {}

  /**
   * 为计划生成完整的 DEM 证据管道结果
   * 
   * @param plan 旅行计划
   * @param routeDirection 路线方向
   * @param routeSegmentation 路线分段结果（可选）
   * @returns DEM 证据管道结果
   */
  async generateEvidencePipeline(
    plan: TripPlan,
    routeDirection?: RouteDirectionData,
    routeSegmentation?: RouteSegmentation,
  ): Promise<DemEvidencePipelineResult> {
    // 1. 生成所有路段的证据
    const segmentEvidences = await this.generateDecisionEvidence(
      plan,
      routeDirection,
      routeSegmentation,
    );

    // 2. 检查是否有违反
    const hasHardViolation = segmentEvidences.some(e => e.violation === 'HARD');
    const hasSoftViolation = segmentEvidences.some(e => e.violation === 'SOFT');

    // 3. 连续疲劳检测
    const rollingFatigue = this.detectRollingFatigue(plan, routeDirection);

    // 4. 走廊质量评分（如果有分段结果）
    const corridorQuality = routeSegmentation
      ? await this.scoreCorridorQuality(routeSegmentation, routeDirection)
      : undefined;

    // 5. 生成可解释失败说明
    const explainableFailure = this.generateExplainableFailure(
      segmentEvidences,
      rollingFatigue,
      corridorQuality,
    );

    return {
      segmentEvidences,
      hasHardViolation,
      hasSoftViolation,
      rollingFatigue,
      corridorQuality,
      explainableFailure,
      canProceed: !hasHardViolation,
    };
  }

  /**
   * 为计划生成 DEM 决策证据
   */
  private async generateDecisionEvidence(
    plan: TripPlan,
    routeDirection?: RouteDirectionData,
    routeSegmentation?: RouteSegmentation,
  ): Promise<DemDecisionEvidence[]> {
    const evidences: DemDecisionEvidence[] = [];

    for (let i = 0; i < plan.days.length; i++) {
      const day = plan.days[i];
      const evidence = await this.generateDayEvidence(
        day,
        i + 1,
        plan,
        routeDirection,
        routeSegmentation,
      );
      evidences.push(evidence);
    }

    return evidences;
  }

  /**
   * 为单天生成 DEM 决策证据
   */
  private async generateDayEvidence(
    day: PlanDay,
    dayNumber: number,
    plan: TripPlan,
    routeDirection?: RouteDirectionData,
    routeSegmentation?: RouteSegmentation,
  ): Promise<DemDecisionEvidence> {
    const segmentId = `day_${day.day}_${day.date}`;

    // 1. 提取海拔剖面（简化为海拔数组）
    const elevationProfile = this.extractElevationProfileArray(day, routeSegmentation);

    // 2. 计算累计爬升
    const cumulativeAscent = day.terrainFacts?.totalAscent || 0;

    // 3. 计算最大坡度
    const maxSlopePct = this.calculateMaxSlopeFromProfile(elevationProfile);

    // 4. 计算3天滚动窗口累计爬升
    const rollingAscent3Days = this.calculateRollingAscent(plan, dayNumber, 3);

    // 5. 计算疲劳指数
    const fatigueIndex = this.calculateFatigueIndex(
      cumulativeAscent,
      maxSlopePct,
      day.terrainFacts?.maxElevation || 0,
    );

    // 6. 检查违反约束
    const violation = this.checkViolations(
      day,
      routeDirection,
      cumulativeAscent,
      maxSlopePct,
      day.terrainFacts?.maxElevation || 0,
    );

    // 7. 生成解释
    const explanation = this.generateExplanation(
      day,
      violation,
      cumulativeAscent,
      maxSlopePct,
      rollingAscent3Days,
    );

    // 8. 生成元数据
    const metadata = this.generateMetadata(day, elevationProfile);

    return {
      segmentId,
      elevationProfile,
      cumulativeAscent,
      maxSlopePct,
      rollingAscent3Days,
      fatigueIndex,
      violation,
      explanation,
      metadata,
    };
  }

  /**
   * 提取海拔剖面数组（简化版）
   */
  private extractElevationProfileArray(
    day: PlanDay,
    routeSegmentation?: RouteSegmentation,
  ): number[] {
    // 优先使用分段结果
    if (routeSegmentation?.elevationProfile && routeSegmentation.elevationProfile.length > 0) {
      return routeSegmentation.elevationProfile.map(p => p.elevation);
    }

    // 如果没有分段结果，从 terrainFacts 推断
    if (day.terrainFacts) {
      const minElevation = day.terrainFacts.minElevation || 0;
      const maxElevation = day.terrainFacts.maxElevation || minElevation;
      
      // 创建简化剖面（10个点）
      const profile: number[] = [];
      for (let i = 0; i < 10; i++) {
        const ratio = i / 9;
        profile.push(minElevation + (maxElevation - minElevation) * ratio);
      }
      return profile;
    }

    return [];
  }

  /**
   * 从海拔剖面计算最大坡度
   */
  private calculateMaxSlopeFromProfile(profile: number[]): number {
    if (profile.length < 2) {
      return 0;
    }

    let maxSlope = 0;
    const distancePerPoint = 1000; // 假设每点间隔1km

    for (let i = 1; i < profile.length; i++) {
      const elevationDiff = Math.abs(profile[i] - profile[i - 1]);
      const slope = (elevationDiff / distancePerPoint) * 100; // 转换为百分比
      if (slope > maxSlope) {
        maxSlope = slope;
      }
    }

    return maxSlope;
  }

  /**
   * 计算滚动窗口累计爬升
   */
  private calculateRollingAscent(plan: TripPlan, currentDay: number, windowDays: number): number {
    const startDay = Math.max(1, currentDay - windowDays + 1);
    let totalAscent = 0;

    for (let i = startDay; i <= currentDay && i <= plan.days.length; i++) {
      const day = plan.days[i - 1];
      totalAscent += day.terrainFacts?.totalAscent || 0;
    }

    return totalAscent;
  }

  /**
   * 计算疲劳指数（0-100）
   */
  private calculateFatigueIndex(
    cumulativeAscent: number,
    maxSlope: number,
    maxElevation: number,
  ): number {
    // 基础疲劳：累计爬升（每100米 = 1点）
    const ascentFatigue = Math.min(cumulativeAscent / 100, 50);
    
    // 坡度疲劳：最大坡度（每1% = 0.5点，超过20%加倍）
    const slopeFatigue = maxSlope <= 20
      ? maxSlope * 0.5
      : 10 + (maxSlope - 20) * 1.0;
    
    // 海拔疲劳：超过3000米开始累加（每100米 = 1点）
    const altitudeFatigue = maxElevation > 3000
      ? Math.min((maxElevation - 3000) / 100, 30)
      : 0;
    
    // 总疲劳指数（上限100）
    return Math.min(ascentFatigue + slopeFatigue + altitudeFatigue, 100);
  }

  /**
   * 检查违反约束
   */
  private checkViolations(
    day: PlanDay,
    routeDirection: RouteDirectionData | undefined,
    cumulativeAscent: number,
    maxSlope: number,
    maxElevation: number,
  ): 'HARD' | 'SOFT' | 'NONE' {
    if (!routeDirection?.constraints) {
      return 'NONE';
    }

    const hardConstraints = routeDirection.constraints.hard || {};
    const softConstraints = routeDirection.constraints.soft || {};

    // 检查硬约束
    // 1. 最大海拔
    if (hardConstraints.maxElevationM && maxElevation > hardConstraints.maxElevationM) {
      return 'HARD';
    }

    // 2. 最大坡度
    if (hardConstraints.maxSlopePct && maxSlope > hardConstraints.maxSlopePct) {
      return 'HARD';
    }

    // 3. 快速爬升禁止
    if (hardConstraints.rapidAscentForbidden) {
      const maxDailyRapidAscent = hardConstraints.maxDailyRapidAscentM || 600;
      if (cumulativeAscent > maxDailyRapidAscent) {
        return 'HARD';
      }
    }

    // 检查软约束
    if (softConstraints.maxElevationM && maxElevation > softConstraints.maxElevationM) {
      return 'SOFT';
    }

    if (softConstraints.maxDailyAscentM && cumulativeAscent > softConstraints.maxDailyAscentM) {
      return 'SOFT';
    }

    return 'NONE';
  }

  /**
   * 生成解释
   */
  private generateExplanation(
    day: PlanDay,
    violation: 'HARD' | 'SOFT' | 'NONE',
    cumulativeAscent: number,
    maxSlope: number,
    rollingAscent3Days: number,
  ): string {
    if (violation === 'HARD') {
      return `第${day.day}天违反硬约束：累计爬升${cumulativeAscent}m，最大坡度${maxSlope.toFixed(1)}%，3天滚动累计${rollingAscent3Days}m`;
    } else if (violation === 'SOFT') {
      return `第${day.day}天违反软约束：累计爬升${cumulativeAscent}m，最大坡度${maxSlope.toFixed(1)}%`;
    } else {
      return `第${day.day}天：累计爬升${cumulativeAscent}m，最大坡度${maxSlope.toFixed(1)}%，3天滚动累计${rollingAscent3Days}m`;
    }
  }

  /**
   * 生成元数据
   */
  private generateMetadata(
    day: PlanDay,
    elevationProfile: number[],
  ): DemDecisionEvidence['metadata'] {
    const elevations = elevationProfile.length > 0 ? elevationProfile : 
      (day.terrainFacts?.maxElevation ? [day.terrainFacts.maxElevation] : []);

    if (elevations.length === 0) {
      return undefined;
    }

    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;

    // 计算平均坡度（简化）
    let totalSlope = 0;
    let slopeCount = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = Math.abs(elevations[i] - elevations[i - 1]);
      const distance = 1000; // 假设每点1km
      totalSlope += (diff / distance) * 100;
      slopeCount++;
    }
    const avgSlopePct = slopeCount > 0 ? totalSlope / slopeCount : 0;

    return {
      elevationRange: {
        min: minElevation,
        max: maxElevation,
      },
      avgSlopePct,
      distanceM: elevations.length * 1000, // 估算
    };
  }

  /**
   * 强制「连续日疲劳检测」（rolling window 3天）
   * 
   * PART 2.1: 连续日疲劳检测
   * if (rollingAscent3Days > threshold)
   *   -> Dr.Dre 强制插入缓冲日
   */
  private detectRollingFatigue(
    plan: TripPlan,
    routeDirection?: RouteDirectionData,
  ): RollingFatigueDetection | undefined {
    const windowDays = 3;
    // 默认阈值：3天累计爬升超过2000米
    const defaultThreshold = 2000;

    if (plan.days.length < windowDays) {
      return {
        detected: false,
        rollingAscent3Days: 0,
        userThreshold: defaultThreshold,
        suggestedAction: 'NONE',
        explanation: '行程天数不足3天，无法进行连续疲劳检测',
      };
    }

    // 检查所有3天窗口
    for (let i = windowDays - 1; i < plan.days.length; i++) {
      const windowStart = i - windowDays + 1;
      const windowDaysList = plan.days.slice(windowStart, i + 1);

      // 计算窗口内的累计爬升
      let rollingAscent = 0;
      for (const day of windowDaysList) {
        rollingAscent += day.terrainFacts?.totalAscent || 0;
      }

      if (rollingAscent > defaultThreshold) {
        return {
          detected: true,
          startDay: windowStart + 1,
          endDay: i + 1,
          rollingAscent3Days: rollingAscent,
          userThreshold: defaultThreshold,
          suggestedAction: rollingAscent > defaultThreshold * 1.5 ? 'INSERT_REST_DAY' : 'SPLIT_DAYS',
          explanation: `第${windowStart + 1}-${i + 1}天连续3天累计爬升${rollingAscent}m，超过阈值${defaultThreshold}m，建议${rollingAscent > defaultThreshold * 1.5 ? '插入休息日' : '拆分行程'}`,
        };
      }
    }

    return {
      detected: false,
      rollingAscent3Days: 0,
      userThreshold: defaultThreshold,
      suggestedAction: 'NONE',
      explanation: '未检测到连续疲劳',
    };
  }

  /**
   * 走廊质量评分
   * 
   * PART 2.2: 走廊质量评分
   * corridorScore = viewExposureScore * 0.4 + elevationVariance * 0.3 - slopePenalty * 0.3
   */
  private async scoreCorridorQuality(
    routeSegmentation: RouteSegmentation,
    routeDirection?: RouteDirectionData,
  ): Promise<CorridorQualityScore> {
    const profile = routeSegmentation.elevationProfile;

    // 1. 计算视野暴露度（viewExposure）
    const viewExposureScore = this.calculateViewExposure(profile);

    // 2. 计算海拔变化度（elevationVariance）
    const elevationVariance = this.calculateElevationVariance(profile);

    // 3. 计算坡度惩罚（slopePenalty）
    const slopePenalty = this.calculateSlopePenalty(routeSegmentation);

    // 4. 总评分
    const totalScore = Math.max(0, Math.min(100,
      viewExposureScore * 0.4 +
      elevationVariance * 0.3 +
      (100 - slopePenalty) * 0.3
    ));

    // 5. 生成解释
    const explanation = `走廊质量评分：${totalScore.toFixed(1)}/100。视野暴露度：${viewExposureScore.toFixed(1)}，海拔变化度：${elevationVariance.toFixed(1)}，坡度惩罚：${slopePenalty.toFixed(1)}`;

    return {
      totalScore,
      viewExposureScore,
      elevationVariance,
      slopePenalty,
      explanation,
    };
  }

  /**
   * 计算视野暴露度（0-100）
   */
  private calculateViewExposure(profile: Array<{ elevation: number }>): number {
    if (profile.length < 2) {
      return 0;
    }

    // 计算海拔变化频率（变化次数 / 总点数）
    let changeCount = 0;
    for (let i = 1; i < profile.length; i++) {
      if (Math.abs(profile[i].elevation - profile[i - 1].elevation) > 10) {
        changeCount++;
      }
    }

    const changeFrequency = changeCount / profile.length;

    // 计算海拔变化幅度（标准差）
    const elevations = profile.map(p => p.elevation);
    const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length;
    const variance = elevations.reduce((sum, e) => sum + Math.pow(e - avgElevation, 2), 0) / elevations.length;
    const stdDev = Math.sqrt(variance);
    const normalizedStdDev = Math.min(stdDev / 500, 1); // 归一化

    // 视野暴露度 = 变化频率 * 0.5 + 变化幅度 * 0.5
    return (changeFrequency * 0.5 + normalizedStdDev * 0.5) * 100;
  }

  /**
   * 计算海拔变化度（0-100）
   */
  private calculateElevationVariance(profile: Array<{ elevation: number }>): number {
    if (profile.length < 2) {
      return 0;
    }

    const elevations = profile.map(p => p.elevation);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationRange = maxElevation - minElevation;

    // 归一化（假设2000m为典型变化范围）
    return Math.min(elevationRange / 2000, 1) * 100;
  }

  /**
   * 计算坡度惩罚（0-100，越大越差）
   */
  private calculateSlopePenalty(routeSegmentation: RouteSegmentation): number {
    const avgSlope = routeSegmentation.avgSlope;
    const maxSlope = routeSegmentation.maxSlope;

    // 惩罚 = 平均坡度 * 0.6 + 最大坡度 * 0.4
    // 归一化（假设30%为极端坡度）
    const avgSlopePenalty = Math.min(avgSlope / 30, 1) * 100;
    const maxSlopePenalty = Math.min(maxSlope / 30, 1) * 100;

    return avgSlopePenalty * 0.6 + maxSlopePenalty * 0.4;
  }

  /**
   * 生成可解释失败原因
   * 
   * PART 2.3: 可解释失败原因
   * 「这条路线被淘汰，因为在第 4–6 天出现连续 28% 坡度」
   */
  private generateExplainableFailure(
    evidences: DemDecisionEvidence[],
    rollingFatigue?: RollingFatigueDetection,
    corridorQuality?: CorridorQualityScore,
  ): DemEvidencePipelineResult['explainableFailure'] | undefined {
    // 1. 检查硬约束违反
    const hardViolations = evidences.filter(e => e.violation === 'HARD');
    if (hardViolations.length > 0) {
      const affectedDays = hardViolations.map(e => {
        const match = e.segmentId.match(/day_(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }).filter(d => d > 0);

      const reasons = hardViolations.map(e => {
        if (e.maxSlopePct > 20) {
          return `第${affectedDays[0]}天出现${e.maxSlopePct.toFixed(1)}%的最大坡度`;
        } else if (e.cumulativeAscent > 1000) {
          return `第${affectedDays[0]}天累计爬升${e.cumulativeAscent}m超过限制`;
        } else {
          return e.explanation;
        }
      });

      return {
        reason: reasons.join('；'),
        affectedDays,
        userImpact: '路线因违反硬约束被淘汰，必须修复后才能继续',
      };
    }

    // 2. 检查连续疲劳
    if (rollingFatigue?.detected) {
      return {
        reason: `第${rollingFatigue.startDay}-${rollingFatigue.endDay}天连续3天累计爬升${rollingFatigue.rollingAscent3Days}m，超过阈值${rollingFatigue.userThreshold}m`,
        affectedDays: rollingFatigue.startDay && rollingFatigue.endDay
          ? Array.from({ length: rollingFatigue.endDay - rollingFatigue.startDay + 1 }, (_, i) => rollingFatigue.startDay! + i)
          : [],
        userImpact: '建议插入休息日或拆分行程以降低疲劳风险',
      };
    }

    // 3. 检查走廊质量
    if (corridorQuality && corridorQuality.totalScore < 40) {
      return {
        reason: `走廊质量评分过低（${corridorQuality.totalScore.toFixed(1)}/100），视野暴露度：${corridorQuality.viewExposureScore.toFixed(1)}，坡度惩罚：${corridorQuality.slopePenalty.toFixed(1)}`,
        affectedDays: [],
        userImpact: '路线质量不佳，建议选择其他路线',
      };
    }

    return undefined;
  }

  /**
   * 验证计划是否有 DEM 证据
   * 
   * 强制检查：没有 DEM evidence 的 plan 不允许 finalize
   */
  validatePlanHasEvidence(
    plan: TripPlan,
    evidences: DemDecisionEvidence[],
  ): { valid: boolean; reason?: string } {
    if (evidences.length === 0) {
      return {
        valid: false,
        reason: '计划缺少 DEM 决策证据，无法 finalize',
      };
    }

    if (evidences.length !== plan.days.length) {
      return {
        valid: false,
        reason: `DEM 证据数量（${evidences.length}）与计划天数（${plan.days.length}）不匹配`,
      };
    }

    // 检查是否有硬约束违反
    const hasHardViolation = evidences.some(e => e.violation === 'HARD');
    if (hasHardViolation) {
      return {
        valid: false,
        reason: '计划存在硬约束违反，必须修复后才能 finalize',
      };
    }

    return { valid: true };
  }
}
