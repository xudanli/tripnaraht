// src/trips/decision/constraints/constraint-conflict-resolver.service.ts

/**
 * 约束冲突解析器
 * 
 * 检测并解释约束之间的冲突
 * 生成权衡选项和修复建议
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ConstraintDSL,
  ConstraintConflict,
  ConstraintConflictResult,
  TradeoffExplanation,
} from './constraint-dsl.types';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';

@Injectable()
export class ConstraintConflictResolver {
  private readonly logger = new Logger(ConstraintConflictResolver.name);

  /**
   * 检测并解释约束冲突
   */
  async detectAndExplainConflicts(
    constraints: ConstraintDSL,
    plan: TripPlan | null,
    state: TripWorldState
  ): Promise<ConstraintConflictResult> {
    const conflicts: ConstraintConflict[] = [];

    // 1. 预算 vs 住宿品质冲突
    if (constraints.hard_constraints?.budget && constraints.soft_constraints?.comfort_level) {
      const budgetConflict = this.detectBudgetVsComfortConflict(
        constraints,
        plan,
        state
      );
      if (budgetConflict) {
        conflicts.push(budgetConflict);
      }
    }

    // 2. 节奏 vs 体力限制冲突
    if (constraints.soft_constraints?.pace && constraints.hard_constraints?.physical_limitations) {
      const paceConflict = this.detectPaceVsPhysicalConflict(constraints, plan, state);
      if (paceConflict) {
        conflicts.push(paceConflict);
      }
    }

    // 3. 日期窗口 vs 活动数量冲突
    if (constraints.hard_constraints?.date_window && plan) {
      const dateConflict = this.detectDateWindowVsActivityConflict(
        constraints,
        plan,
        state
      );
      if (dateConflict) {
        conflicts.push(dateConflict);
      }
    }

    // 4. 交通方式 vs 时间窗口冲突
    if (constraints.hard_constraints?.travel_mode && plan) {
      const transportConflict = this.detectTransportVsTimeConflict(
        constraints,
        plan,
        state
      );
      if (transportConflict) {
        conflicts.push(transportConflict);
      }
    }

    // 5. 风险容忍度 vs 活动风险冲突
    if (constraints.soft_constraints?.risk_tolerance && plan) {
      const riskConflict = this.detectRiskToleranceConflict(constraints, plan, state);
      if (riskConflict) {
        conflicts.push(riskConflict);
      }
    }

    // 统计冲突数量
    const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
    const highCount = conflicts.filter(c => c.severity === 'high').length;
    const mediumCount = conflicts.filter(c => c.severity === 'medium').length;
    const lowCount = conflicts.filter(c => c.severity === 'low').length;

    return {
      conflicts,
      has_conflicts: conflicts.length > 0,
      critical_count: criticalCount,
      high_count: highCount,
      medium_count: mediumCount,
      low_count: lowCount,
    };
  }

  /**
   * 检测预算 vs 住宿品质冲突
   */
  private detectBudgetVsComfortConflict(
    constraints: ConstraintDSL,
    _plan: TripPlan | null,
    _state: TripWorldState
  ): ConstraintConflict | null {
    const budget = constraints.hard_constraints!.budget!;
    const comfort = constraints.soft_constraints!.comfort_level!;

    // 估算住宿成本（简化：根据品质等级估算）
    const hotelQualityCostMap: Record<string, number> = {
      low: 0.2, // 预算的20%
      medium: 0.35, // 预算的35%
      high: 0.5, // 预算的50%
    };

    const estimatedHotelCost = budget.max * hotelQualityCostMap[comfort.hotel_quality];
    const maxHotelBudget = budget.max * 0.4; // 住宿不应超过预算的40%

    if (estimatedHotelCost > maxHotelBudget) {
      const overrunPercent = Math.round(((estimatedHotelCost - maxHotelBudget) / budget.max) * 100);
      const severity: ConstraintConflict['severity'] =
        overrunPercent > 20 ? 'high' : overrunPercent > 10 ? 'medium' : 'low';

      return {
        between: ['budget', 'hotel_quality'],
        description: `高住宿品质（${comfort.hotel_quality}）与当前预算存在冲突，预计住宿成本将超过预算的${Math.round((estimatedHotelCost / budget.max) * 100)}%`,
        severity,
        tradeoff_options: [
          `增加预算 ${overrunPercent}%`,
          '减少住宿夜数',
          '接受非市中心位置',
          `降低住宿品质要求至 ${comfort.hotel_quality === 'high' ? 'medium' : 'low'}`,
        ],
        details: {
          budget_max: budget.max,
          budget_currency: budget.currency,
          hotel_quality: comfort.hotel_quality,
          estimated_hotel_cost: estimatedHotelCost,
          max_hotel_budget: maxHotelBudget,
          overrun_percent: overrunPercent,
        },
      };
    }

    return null;
  }

  /**
   * 检测节奏 vs 体力限制冲突
   */
  private detectPaceVsPhysicalConflict(
    constraints: ConstraintDSL,
    _plan: TripPlan | null,
    _state: TripWorldState
  ): ConstraintConflict | null {
    const pace = constraints.soft_constraints!.pace!;
    const physical = constraints.hard_constraints!.physical_limitations!;

    // 紧凑节奏需要更多活动时间
    const paceHoursMap: Record<string, number> = {
      relaxed: 4,
      moderate: 6,
      intense: 8,
    };

    const requiredHours = paceHoursMap[pace.preference];
    const maxHours = physical.daily_activity_hours_max;

    if (maxHours && requiredHours > maxHours) {
      const severity: ConstraintConflict['severity'] =
        requiredHours - maxHours > 2 ? 'high' : 'medium';

      return {
        between: ['pace', 'physical_limitations'],
        description: `紧凑节奏（${pace.preference}）需要每日约${requiredHours}小时活动时间，但体力限制为每日最多${maxHours}小时`,
        severity,
        tradeoff_options: [
          `调整节奏为 ${pace.preference === 'intense' ? 'moderate' : 'relaxed'}`,
          maxHours < 6 ? '增加体力限制（如果可能）' : '接受部分天数的紧凑安排',
          '在行程中增加休息日',
        ],
        details: {
          pace_preference: pace.preference,
          required_hours: requiredHours,
          max_hours: maxHours,
          deficit_hours: requiredHours - maxHours,
        },
      };
    }

    return null;
  }

  /**
   * 检测日期窗口 vs 活动数量冲突
   */
  private detectDateWindowVsActivityConflict(
    constraints: ConstraintDSL,
    plan: TripPlan,
    _state: TripWorldState
  ): ConstraintConflict | null {
    const dateWindow = constraints.hard_constraints!.date_window!;
    const startDate = new Date(dateWindow.start);
    const endDate = new Date(dateWindow.end);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // 计算计划中的活动数量
    const totalActivities = plan.days.reduce(
      (sum, day) => sum + day.timeSlots.filter(slot => slot.type !== 'rest' && slot.type !== 'transport').length,
      0
    );

    // 如果活动密度过高（每天超过5个活动）
    const avgActivitiesPerDay = totalActivities / days;
    if (avgActivitiesPerDay > 5) {
      return {
        between: ['date_window', 'activity_count'],
        description: `在${days}天的行程中安排了${totalActivities}个活动，平均每天${avgActivitiesPerDay.toFixed(1)}个，可能导致行程过于紧凑`,
        severity: avgActivitiesPerDay > 7 ? 'high' : 'medium',
        tradeoff_options: [
          '延长行程日期',
          '减少活动数量',
          '接受紧凑的行程安排',
        ],
        details: {
          days,
          total_activities: totalActivities,
          avg_activities_per_day: avgActivitiesPerDay,
        },
      };
    }

    return null;
  }

  /**
   * 检测交通方式 vs 时间窗口冲突
   */
  private detectTransportVsTimeConflict(
    constraints: ConstraintDSL,
    plan: TripPlan,
    _state: TripWorldState
  ): ConstraintConflict | null {
    const travelMode = constraints.hard_constraints!.travel_mode!;

    // 检查是否有早于7点的活动（如果禁止早起）
    if (travelMode.no_early_morning) {
      const earlyActivitiesWithDay = plan.days.flatMap(day =>
        day.timeSlots
          .filter(slot => {
            const hour = parseInt(slot.time.split(':')[0]);
            return hour < 7;
          })
          .map(slot => ({ slot, dayNumber: day.day }))
      );

      if (earlyActivitiesWithDay.length > 0) {
        return {
          between: ['travel_mode', 'time_window'],
          description: `禁止早起，但行程中包含${earlyActivitiesWithDay.length}个早于7点的活动`,
          severity: 'medium',
          tradeoff_options: [
            '调整活动时间到7点之后',
            '移除需要早起的活动',
            '允许早起（如果可能）',
          ],
          affected_days: Array.from(new Set(earlyActivitiesWithDay.map(a => a.dayNumber))),
          details: {
            early_activity_count: earlyActivitiesWithDay.length,
            no_early_morning: true,
          },
        };
      }
    }

    // 检查是否有晚于22点的活动（如果禁止夜车）
    if (travelMode.no_late_night) {
      const lateActivitiesWithDay = plan.days.flatMap(day =>
        day.timeSlots
          .filter(slot => {
            const hour = parseInt(slot.time.split(':')[0]);
            return hour >= 22;
          })
          .map(slot => ({ slot, dayNumber: day.day }))
      );

      if (lateActivitiesWithDay.length > 0) {
        return {
          between: ['travel_mode', 'time_window'],
          description: `禁止夜车，但行程中包含${lateActivitiesWithDay.length}个晚于22点的活动`,
          severity: 'medium',
          tradeoff_options: [
            '调整活动时间到22点之前',
            '移除需要夜车的活动',
            '允许夜车（如果可能）',
          ],
          affected_days: Array.from(new Set(lateActivitiesWithDay.map(a => a.dayNumber))),
          details: {
            late_activity_count: lateActivitiesWithDay.length,
            no_late_night: true,
          },
        };
      }
    }

    return null;
  }

  /**
   * 检测风险容忍度冲突
   */
  private detectRiskToleranceConflict(
    constraints: ConstraintDSL,
    plan: TripPlan,
    _state: TripWorldState
  ): ConstraintConflict | null {
    const riskTolerance = constraints.soft_constraints!.risk_tolerance!;

    // 如果用户风险容忍度低，但计划中包含高风险活动
    if (riskTolerance.level === 'low') {
      // 这里需要从plan中提取活动风险信息
      // 简化：假设有高风险活动检测逻辑
      const highRiskActivities = plan.days.flatMap(day =>
        day.timeSlots.filter(slot => {
          // 假设slot有riskLevel属性
          return (slot as any).riskLevel === 'high';
        })
      );

      if (highRiskActivities.length > 0) {
        return {
          between: ['risk_tolerance', 'activity_risk'],
          description: `用户风险容忍度为低，但行程中包含${highRiskActivities.length}个高风险活动`,
          severity: 'high',
          tradeoff_options: [
            '替换为低风险活动',
            '确认用户是否接受高风险活动',
            '调整风险容忍度设置',
          ],
          details: {
            user_risk_tolerance: riskTolerance.level,
            high_risk_activity_count: highRiskActivities.length,
          },
        };
      }
    }

    return null;
  }

  /**
   * 生成权衡解释
   */
  generateTradeoffExplanation(
    conflict: ConstraintConflict,
    _currentPlan: TripPlan | null
  ): TradeoffExplanation {
    const [constraintA, constraintB] = conflict.between;

    return {
      conflict_type: `${constraintA} vs ${constraintB}`,
      current_state: {
        constraint_a_value: conflict.details?.[constraintA] || 'unknown',
        constraint_b_value: conflict.details?.[constraintB] || 'unknown',
        conflict_reason: conflict.description,
      },
      options: conflict.tradeoff_options.map((option, _index) => {
        // 根据选项内容判断推荐程度
        let recommendation: 'recommended' | 'optional' | 'not_recommended' = 'optional';
        if (option.includes('增加') || option.includes('调整')) {
          recommendation = 'recommended';
        } else if (option.includes('接受') || option.includes('允许')) {
          recommendation = 'optional';
        }

        return {
          option,
          impact: {
            constraint_a_change: this.analyzeConstraintChange(option, constraintA),
            constraint_b_change: this.analyzeConstraintChange(option, constraintB),
            overall_impact: this.analyzeOverallImpact(option, conflict.severity),
          },
          recommendation,
        };
      }),
    };
  }

  /**
   * 分析约束变化
   */
  private analyzeConstraintChange(option: string, constraint: string): string {
    if (option.includes('增加')) {
      return `增加${constraint}的值`;
    } else if (option.includes('减少') || option.includes('降低')) {
      return `减少${constraint}的值`;
    } else if (option.includes('调整')) {
      return `调整${constraint}的设置`;
    }
    return `保持${constraint}不变`;
  }

  /**
   * 分析整体影响
   */
  private analyzeOverallImpact(
    option: string,
    severity: ConstraintConflict['severity']
  ): 'positive' | 'negative' | 'neutral' {
    if (option.includes('增加') || option.includes('延长')) {
      return severity === 'critical' || severity === 'high' ? 'positive' : 'neutral';
    } else if (option.includes('减少') || option.includes('降低')) {
      return 'negative';
    }
    return 'neutral';
  }
}
