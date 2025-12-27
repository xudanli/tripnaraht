// src/trips/decision/services/dry-run-planner.service.ts

/**
 * Dry-run Planner Service
 * 
 * 失败模拟器：在生成计划前先模拟执行，找出可能失败的点
 * 
 * 核心思想：如果我是这个人，这条路线我会在哪一天崩？
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripWorldState, ActivityCandidate } from '../world-model';
import { TripPlan, PlanDay, PlanSlot } from '../plan-model';
import { DecisionParams } from '../../../agent/memory/interfaces/decision-params.interface';
import { DEMDailyEnergyService } from './dem-daily-energy.service';
import { DEMRiskScoringService } from './dem-risk-scoring.service';

export interface DryRunResult {
  willFail: boolean;
  failureDay?: number;
  failureReason?: string;
  riskPoints: Array<{
    day: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    reason: string;
    suggestion?: string;
  }>;
  energyOverloads: Array<{
    day: number;
    expectedEnergy: number;
    maxEnergy: number;
    overload: number;
  }>;
  constraintViolations: Array<{
    day: number;
    constraint: string;
    value: number;
    limit: number;
  }>;
  recommendations: string[];
}

@Injectable()
export class DryRunPlannerService {
  private readonly logger = new Logger(DryRunPlannerService.name);

  constructor(
    @Optional() private readonly demDailyEnergyService?: DEMDailyEnergyService,
    @Optional() private readonly demRiskScoringService?: DEMRiskScoringService
  ) {}

  /**
   * 对计划进行 Dry-run 模拟
   * 
   * 模拟执行计划，找出可能失败的点
   */
  async simulatePlan(
    state: TripWorldState,
    plan: TripPlan,
    decisionParams?: DecisionParams
  ): Promise<DryRunResult> {
    const result: DryRunResult = {
      willFail: false,
      riskPoints: [],
      energyOverloads: [],
      constraintViolations: [],
      recommendations: [],
    };

    this.logger.debug(`Starting dry-run simulation for ${plan.days.length} days`);

    // 1. 检查每日体力预算
    if (this.demDailyEnergyService) {
      for (const day of plan.days) {
        try {
          const energyBudget = await this.demDailyEnergyService.calculateDynamicDailyBudget(
            day,
            undefined, // routeDirection
            state.context.preferences.pace || 'moderate'
          );

          if (energyBudget.totalEnergyCost > energyBudget.maxEnergyCost) {
            const overload = energyBudget.totalEnergyCost - energyBudget.maxEnergyCost;
            result.energyOverloads.push({
              day: day.day,
              expectedEnergy: energyBudget.totalEnergyCost,
              maxEnergy: energyBudget.maxEnergyCost,
              overload,
            });

            result.riskPoints.push({
              day: day.day,
              riskLevel: overload > 50 ? 'HIGH' : 'MEDIUM',
              reason: `体力消耗超限 ${overload.toFixed(1)} 单位`,
              suggestion: '建议拆天或减少活动强度',
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to calculate energy budget for day ${day.day}: ${error}`);
        }
      }
    }

    // 2. 检查约束违反
    const constraints = decisionParams?.constraints || (state.policies as any)?.hardConstraints || {};
    const softConstraints = decisionParams?.constraints || (state.policies as any)?.softConstraints || {};

    for (const day of plan.days) {
      // 检查海拔约束
      if (constraints.maxElevationM && day.terrainFacts?.maxElevation) {
        if (day.terrainFacts.maxElevation > constraints.maxElevationM) {
          result.constraintViolations.push({
            day: day.day,
            constraint: 'maxElevationM',
            value: day.terrainFacts.maxElevation,
            limit: constraints.maxElevationM,
          });

          result.riskPoints.push({
            day: day.day,
            riskLevel: 'HIGH',
            reason: `海拔 ${day.terrainFacts.maxElevation}m 超过限制 ${constraints.maxElevationM}m`,
            suggestion: '建议选择低海拔路线或增加适应日',
          });
        }
      }

      // 检查每日爬升约束
      if (softConstraints.maxDailyAscentM && day.terrainFacts?.totalAscent) {
        if (day.terrainFacts.totalAscent > softConstraints.maxDailyAscentM) {
          result.constraintViolations.push({
            day: day.day,
            constraint: 'maxDailyAscentM',
            value: day.terrainFacts.totalAscent,
            limit: softConstraints.maxDailyAscentM,
          });

          result.riskPoints.push({
            day: day.day,
            riskLevel: 'MEDIUM',
            reason: `每日爬升 ${day.terrainFacts.totalAscent}m 超过建议值 ${softConstraints.maxDailyAscentM}m`,
            suggestion: '建议拆天或增加休息时间',
          });
        }
      }
    }

    // 3. 检查风险评分
    if (this.demRiskScoringService) {
      try {
        const planRiskScore = await this.demRiskScoringService.calculatePlanRiskScore(plan);
        
        if (planRiskScore && planRiskScore.totalRiskScore > 70) {
          result.riskPoints.push({
            day: 0, // 整体风险
            riskLevel: 'HIGH',
            reason: `整体风险评分 ${planRiskScore.totalRiskScore.toFixed(1)}% 过高`,
            suggestion: '建议选择更稳定的路线或增加缓冲时间',
          });
        }

        // 检查每日风险
        if (planRiskScore?.dailyRiskScores) {
          for (const dailyRisk of planRiskScore.dailyRiskScores) {
            if (dailyRisk.riskScore > 0.7) {
              result.riskPoints.push({
                day: dailyRisk.day,
                riskLevel: 'HIGH',
                reason: `第 ${dailyRisk.day} 天风险评分 ${(dailyRisk.riskScore * 100).toFixed(1)}% 过高`,
                suggestion: dailyRisk.riskFlags?.map(f => f.message).join('; ') || '建议调整行程',
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to calculate risk score: ${error}`);
      }
    }

    // 4. 检查连续高强度天数
    let consecutiveIntenseDays = 0;
    for (const day of plan.days) {
      const effortLevel = day.terrainFacts?.effortLevel;
      if (effortLevel === 'CHALLENGE' || effortLevel === 'EXTREME') {
        consecutiveIntenseDays += 1;
        if (consecutiveIntenseDays >= 3) {
          result.riskPoints.push({
            day: day.day,
            riskLevel: 'MEDIUM',
            reason: `连续 ${consecutiveIntenseDays} 天高强度活动`,
            suggestion: '建议在第 ' + (day.day - 1) + ' 天插入休息日',
          });
        }
      } else {
        consecutiveIntenseDays = 0;
      }
    }

    // 5. 生成建议
    if (result.energyOverloads.length > 0) {
      result.recommendations.push('检测到体力超限，建议调整活动强度或增加休息时间');
    }
    if (result.constraintViolations.length > 0) {
      result.recommendations.push('检测到约束违反，建议调整路线或降低难度');
    }
    if (result.riskPoints.filter(r => r.riskLevel === 'HIGH').length > 0) {
      result.recommendations.push('检测到高风险点，建议重新评估路线选择');
    }

    // 6. 判断是否会失败
    const highRiskCount = result.riskPoints.filter(r => r.riskLevel === 'HIGH').length;
    const criticalViolations = result.constraintViolations.filter(
      v => v.constraint === 'maxElevationM'
    ).length;

    result.willFail = highRiskCount >= 2 || criticalViolations > 0;

    if (result.willFail) {
      // 找出最可能失败的日期
      const highRiskDays = result.riskPoints
        .filter(r => r.riskLevel === 'HIGH')
        .map(r => r.day)
        .filter(d => d > 0); // 排除整体风险（day=0）

      if (highRiskDays.length > 0) {
        result.failureDay = Math.min(...highRiskDays);
        result.failureReason = result.riskPoints
          .find(r => r.day === result.failureDay && r.riskLevel === 'HIGH')
          ?.reason || '高风险活动';
      }
    }

    this.logger.debug(
      `Dry-run completed: willFail=${result.willFail}, ` +
      `riskPoints=${result.riskPoints.length}, ` +
      `violations=${result.constraintViolations.length}`
    );

    return result;
  }

  /**
   * 根据 Dry-run 结果调整计划
   */
  generateAdjustmentSuggestions(result: DryRunResult): string[] {
    const suggestions: string[] = [];

    if (result.willFail && result.failureDay) {
      suggestions.push(
        `⚠️ 预计在第 ${result.failureDay} 天可能失败：${result.failureReason}`
      );
    }

    // 体力超限建议
    if (result.energyOverloads.length > 0) {
      const avgOverload = result.energyOverloads.reduce((sum, e) => sum + e.overload, 0) /
        result.energyOverloads.length;
      suggestions.push(
        `💪 平均体力超限 ${avgOverload.toFixed(1)} 单位，建议：` +
        `1) 减少每日活动数量 2) 增加休息时间 3) 降低活动强度`
      );
    }

    // 约束违反建议
    if (result.constraintViolations.length > 0) {
      const elevationViolations = result.constraintViolations.filter(
        v => v.constraint === 'maxElevationM'
      );
      if (elevationViolations.length > 0) {
        suggestions.push(
          `⛰️ 检测到海拔超限，建议选择低海拔路线或增加适应日`
        );
      }
    }

    // 高风险建议
    const highRiskDays = result.riskPoints.filter(r => r.riskLevel === 'HIGH');
    if (highRiskDays.length > 0) {
      suggestions.push(
        `⚠️ 检测到 ${highRiskDays.length} 个高风险点，建议：` +
        `1) 选择更稳定的路线 2) 增加缓冲时间 3) 准备应急预案`
      );
    }

    return suggestions;
  }
}

