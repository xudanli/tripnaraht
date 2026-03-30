// src/trips/decision/services/dem-decision-evidence-pipeline.service.ts
/**
 * DEM Decision Evidence Pipeline Service
 * 
 * PART 2: DEM 升级为「否决级证据源」
 * 
 * 强制规则（写进代码，不写进文档）：
 * ❌ 没有 DEM evidence → plan 不可 finalize
 * ❌ Neptune 不允许修复没有 DEM evidence 的 segment
 * ❌ Abu 不允许忽略 HARD violation
 * 
 * 功能：
 * 1. 为每个路段生成 DEM 证据
 * 2. 检测连续疲劳（Rolling Window）
 * 3. 计算走廊质量评分
 * 4. 生成可解释失败说明
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripPlan, PlanDay } from '../plan-model';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../../dem/services/dem-effort-metadata.service';
import {
  DemDecisionEvidence,
  DemEvidencePipelineResult,
  RollingFatigueDetection,
  CorridorQualityScore,
} from '../interfaces/dem-decision-evidence.interface';

@Injectable()
export class DemDecisionEvidencePipelineService {
  private readonly logger = new Logger(DemDecisionEvidencePipelineService.name);

  constructor(
    @Optional() private readonly demElevationService?: DEMElevationService,
    @Optional() private readonly demEffortService?: DEMEffortMetadataService,
  ) {
    if (!demElevationService || !demEffortService) {
      this.logger.warn('DEMElevationService or DEMEffortMetadataService not available. DEM features will be disabled.');
    }
  }

  /**
   * 为整个计划生成 DEM 证据管道结果
   * 
   * 这是主要入口，会：
   * 1. 为每个路段生成证据
   * 2. 检测连续疲劳
   * 3. 计算走廊质量
   * 4. 生成可解释失败说明
   */
  async generateEvidenceForPlan(
    plan: TripPlan,
    userConstraints?: {
      maxDailyAscentM?: number;
      maxElevationM?: number;
      maxSlopePct?: number;
      rollingAscent3DaysThreshold?: number; // 3天滚动窗口阈值
    }
  ): Promise<DemEvidencePipelineResult> {
    const segmentEvidences: DemDecisionEvidence[] = [];
    let hasHardViolation = false;
    let hasSoftViolation = false;

    // 1. 为每一天生成路段证据
    for (const day of plan.days) {
      const dayEvidence = await this.generateEvidenceForDay(day, userConstraints);
      segmentEvidences.push(...dayEvidence);
      
      // 检查违规
      for (const evidence of dayEvidence) {
        if (evidence.violation === 'HARD') {
          hasHardViolation = true;
        } else if (evidence.violation === 'SOFT') {
          hasSoftViolation = true;
        }
      }
    }

    // 2. 检测连续疲劳（Rolling Window）
    const rollingFatigue = this.detectRollingFatigue(plan.days, userConstraints);

    // 3. 计算走廊质量评分（如果适用）
    const corridorQuality = await this.calculateCorridorQuality(plan);

    // 4. 生成可解释失败说明
    const explainableFailure = this.generateExplainableFailure(
      segmentEvidences,
      rollingFatigue,
      userConstraints
    );

    return {
      segmentEvidences,
      hasHardViolation,
      hasSoftViolation,
      rollingFatigue,
      corridorQuality,
      explainableFailure,
      canProceed: !hasHardViolation, // 有 HARD violation 就不能继续
    };
  }

  /**
   * 为单天生成路段证据
   */
  private async generateEvidenceForDay(
    day: PlanDay,
    userConstraints?: {
      maxDailyAscentM?: number;
      maxElevationM?: number;
      maxSlopePct?: number;
    }
  ): Promise<DemDecisionEvidence[]> {
    const evidences: DemDecisionEvidence[] = [];

    // 如果这一天没有 terrainFacts，尝试从 slots 计算
    if (!day.terrainFacts) {
      this.logger.warn(`Day ${day.day} has no terrainFacts, attempting to compute from slots`);
      // 这里可以尝试从 slots 的 coordinates 计算，但为了简化，先返回空
      return [];
    }

    // 从 terrainFacts 提取数据
    const maxElevation = day.terrainFacts.maxElevation ?? 0;
    const totalAscent = day.terrainFacts.totalAscent ?? 0;
    const maxSlope = day.terrainFacts.maxElevation ? 0 : 0; // 需要从实际路线计算

    // 生成海拔剖面（简化版：从 terrainFacts 推断）
    const elevationProfile = this.inferElevationProfile(day);

    // 计算疲劳指数（归一化 0-100）
    const fatigueIndex = this.calculateFatigueIndex(totalAscent, maxElevation);

    // 检测违规
    let violation: 'HARD' | 'SOFT' | 'NONE' = 'NONE';
    let explanation = '';

    if (userConstraints) {
      if (userConstraints.maxElevationM && maxElevation > userConstraints.maxElevationM) {
        violation = 'HARD';
        explanation = `海拔 ${maxElevation}m 超过用户限制 ${userConstraints.maxElevationM}m`;
      } else if (userConstraints.maxDailyAscentM && totalAscent > userConstraints.maxDailyAscentM) {
        violation = 'SOFT';
        explanation = `累计爬升 ${totalAscent}m 超过建议限制 ${userConstraints.maxDailyAscentM}m`;
      } else if (userConstraints.maxSlopePct && maxSlope > userConstraints.maxSlopePct) {
        violation = 'HARD';
        explanation = `坡度 ${maxSlope}% 超过用户限制 ${userConstraints.maxSlopePct}%`;
      }
    }

    // 如果没有违规，但疲劳指数高，标记为 SOFT
    if (violation === 'NONE' && fatigueIndex > 70) {
      violation = 'SOFT';
      explanation = `疲劳指数 ${fatigueIndex.toFixed(1)} 较高，建议调整节奏`;
    }

    const evidence: DemDecisionEvidence = {
      segmentId: `day-${day.day}`,
      elevationProfile,
      cumulativeAscent: totalAscent,
      maxSlopePct: maxSlope,
      rollingAscent3Days: 0, // 将在 detectRollingFatigue 中计算
      fatigueIndex,
      violation,
      explanation: explanation || '无违规',
      metadata: {
        avgSlopePct: maxSlope, // 简化
        elevationRange: {
          min: day.terrainFacts.minElevation ?? 0,
          max: maxElevation,
        },
      },
    };

    evidences.push(evidence);
    return evidences;
  }

  /**
   * 从 PlanDay 推断海拔剖面（简化版）
   * 实际应该从路线的实际坐标点计算
   */
  private inferElevationProfile(day: PlanDay): number[] {
    // 简化实现：如果有 terrainFacts，生成一个简单的剖面
    if (day.terrainFacts?.maxElevation && day.terrainFacts?.minElevation) {
      const min = day.terrainFacts.minElevation ?? 0;
      const max = day.terrainFacts.maxElevation ?? 0;
      // 生成一个简单的线性剖面（实际应该从实际路线计算）
      return [min, (min + max) / 2, max];
    }
    return [];
  }

  /**
   * 计算疲劳指数（0-100）
   */
  private calculateFatigueIndex(totalAscent: number, maxElevation: number): number {
    // 简化公式：基于爬升和海拔
    const ascentFactor = Math.min(totalAscent / 1000, 1) * 50; // 1000m 爬升 = 50 分
    const elevationFactor = Math.min(maxElevation / 5000, 1) * 50; // 5000m 海拔 = 50 分
    return Math.min(ascentFactor + elevationFactor, 100);
  }

  /**
   * 检测连续疲劳（Rolling Window）
   * 
   * PART 2.1: 连续疲劳（Rolling Window）——这是护城河
   * if (rollingAscent3Days > userThreshold) {
   *   DrDre.insertRestDay();
   * }
   */
  private detectRollingFatigue(
    days: PlanDay[],
    userConstraints?: {
      rollingAscent3DaysThreshold?: number;
    }
  ): RollingFatigueDetection | undefined {
    if (days.length < 3) {
      return undefined; // 至少需要3天才能检测滚动窗口
    }

    const threshold = userConstraints?.rollingAscent3DaysThreshold ?? 2000; // 默认 2000m

    // 计算每天的累计爬升
    const dailyAscents = days.map(day => day.terrainFacts?.totalAscent ?? 0);

    // 滑动窗口检测
    for (let i = 0; i <= days.length - 3; i++) {
      const rollingAscent = dailyAscents[i] + dailyAscents[i + 1] + dailyAscents[i + 2];
      
      if (rollingAscent > threshold) {
        return {
          detected: true,
          startDay: i + 1,
          endDay: i + 3,
          rollingAscent3Days: rollingAscent,
          userThreshold: threshold,
          suggestedAction: 'INSERT_REST_DAY',
          explanation: `第 ${i + 1}-${i + 3} 天连续累计爬升 ${rollingAscent.toFixed(0)}m，超过阈值 ${threshold}m，建议在第 ${i + 2} 或 ${i + 3} 天插入休息日`,
        };
      }
    }

    return {
      detected: false,
      suggestedAction: 'NONE',
      explanation: '未检测到连续疲劳',
      rollingAscent3Days: 0,
      userThreshold: threshold,
    };
  }

  /**
   * 计算走廊质量评分
   * 
   * PART 2.2: 走廊质量评分（真正决定路线优劣）
   * 
   * corridorScore =
   *   viewExposureScore * 0.4
   * + elevationVariance * 0.3
   * - slopePenalty * 0.3
   */
  private async calculateCorridorQuality(plan: TripPlan): Promise<CorridorQualityScore | undefined> {
    if (plan.days.length === 0) {
      return undefined;
    }

    // 收集所有海拔数据
    const elevations: number[] = [];

    for (const day of plan.days) {
      if (day.terrainFacts?.maxElevation) {
        elevations.push(day.terrainFacts.maxElevation);
      }
      // 简化：假设从 terrainFacts 可以推断坡度
      // 实际应该从实际路线计算
    }

    if (elevations.length === 0) {
      return undefined;
    }

    // 1. 计算海拔变化（方差）
    const elevationVariance = this.calculateElevationVariance(elevations);

    // 2. 计算观景暴露度评分（简化：基于海拔变化和最高点）
    const viewExposureScore = this.calculateViewExposureScore(elevations);

    // 3. 计算坡度惩罚（简化：基于累计爬升）
    const slopePenalty = this.calculateSlopePenalty(plan.days);

    // 4. 计算总评分
    const totalScore = Math.max(0, Math.min(100,
      viewExposureScore * 0.4 +
      elevationVariance * 0.3 -
      slopePenalty * 0.3
    ));

    return {
      totalScore,
      viewExposureScore,
      elevationVariance,
      slopePenalty,
      explanation: `走廊质量评分：${totalScore.toFixed(1)}/100。观景暴露度 ${viewExposureScore.toFixed(1)}，海拔变化 ${elevationVariance.toFixed(1)}，坡度惩罚 ${slopePenalty.toFixed(1)}`,
    };
  }

  /**
   * 计算海拔变化（方差）
   */
  private calculateElevationVariance(elevations: number[]): number {
    if (elevations.length < 2) {
      return 50; // 默认中等评分
    }

    const mean = elevations.reduce((a, b) => a + b, 0) / elevations.length;
    const variance = elevations.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / elevations.length;
    const stdDev = Math.sqrt(variance);

    // 归一化到 0-100：标准差越大，变化越丰富
    // 假设 1000m 标准差 = 100 分
    return Math.min(100, (stdDev / 1000) * 100);
  }

  /**
   * 计算观景暴露度评分
   */
  private calculateViewExposureScore(elevations: number[]): number {
    if (elevations.length === 0) {
      return 50;
    }

    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const range = maxElevation - minElevation;

    // 基于海拔范围和最高点评分
    // 假设 3000m 范围 = 100 分
    const rangeScore = Math.min(100, (range / 3000) * 100);
    // 假设 4000m 最高点 = 100 分
    const peakScore = Math.min(100, (maxElevation / 4000) * 100);

    return (rangeScore + peakScore) / 2;
  }

  /**
   * 计算坡度惩罚
   */
  private calculateSlopePenalty(days: PlanDay[]): number {
    let totalAscent = 0;
    let totalDistance = 0; // 简化：假设每天 20km

    for (const day of days) {
      totalAscent += day.terrainFacts?.totalAscent ?? 0;
      totalDistance += 20; // 简化假设
    }

    if (totalDistance === 0) {
      return 0;
    }

    // 计算平均坡度（百分比）
    const avgSlope = (totalAscent / totalDistance) * 100;

    // 惩罚：坡度越大，惩罚越高
    // 假设 20% 坡度 = 100 惩罚
    return Math.min(100, (avgSlope / 20) * 100);
  }

  /**
   * 生成可解释失败说明
   * 
   * PART 2.3: 可解释失败（对内 + 对外）
   * 
   * "不是因为你不行，而是因为
   *  第 4–6 天连续 28% 坡度，与你的体力模型冲突。"
   */
  private generateExplainableFailure(
    evidences: DemDecisionEvidence[],
    rollingFatigue?: RollingFatigueDetection,
    _userConstraints?: {
      maxDailyAscentM?: number;
      maxElevationM?: number;
      maxSlopePct?: number;
    }
  ): { reason: string; affectedDays: number[]; userImpact: string } | undefined {
    const hardViolations = evidences.filter(e => e.violation === 'HARD');
    const softViolations = evidences.filter(e => e.violation === 'SOFT');

    if (hardViolations.length === 0 && softViolations.length === 0 && !rollingFatigue?.detected) {
      return undefined; // 没有失败
    }

    const affectedDays: number[] = [];
    const reasons: string[] = [];

    // 收集 HARD violations
    for (const evidence of hardViolations) {
      const dayMatch = evidence.segmentId.match(/day-(\d+)/);
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10);
        affectedDays.push(day);
        reasons.push(`第 ${day} 天：${evidence.explanation}`);
      }
    }

    // 收集连续疲劳
    if (rollingFatigue?.detected) {
      for (let day = rollingFatigue.startDay!; day <= rollingFatigue.endDay!; day++) {
        if (!affectedDays.includes(day)) {
          affectedDays.push(day);
        }
      }
      reasons.push(rollingFatigue.explanation);
    }

    // 生成用户友好的解释
    let userImpact = '不是因为你不行，而是因为：\n';
    if (hardViolations.length > 0) {
      userImpact += `- 路线地形与你的体力模型存在冲突\n`;
    }
    if (rollingFatigue?.detected) {
      userImpact += `- 连续高强度活动可能导致过度疲劳\n`;
    }
    if (softViolations.length > 0) {
      userImpact += `- 建议调整节奏以提升体验\n`;
    }

    return {
      reason: reasons.join('；'),
      affectedDays: [...new Set(affectedDays)].sort((a, b) => a - b),
      userImpact,
    };
  }

  /**
   * 验证计划是否有 DEM 证据（强制检查）
   * 
   * 强制规则：没有 DEM evidence → plan 不可 finalize
   */
  validatePlanHasEvidence(plan: TripPlan, evidenceResult: DemEvidencePipelineResult): {
    isValid: boolean;
    reason?: string;
  } {
    // 检查是否有证据
    if (evidenceResult.segmentEvidences.length === 0) {
      return {
        isValid: false,
        reason: '计划缺少 DEM 证据，无法验证地形约束',
      };
    }

    // 检查是否有 HARD violation
    if (evidenceResult.hasHardViolation) {
      return {
        isValid: false,
        reason: '计划存在硬约束违规，必须修复后才能继续',
      };
    }

    return { isValid: true };
  }
}

