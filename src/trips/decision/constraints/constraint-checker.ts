// src/trips/decision/constraints/constraint-checker.ts

/**
 * Constraint Checker - 约束校验器
 * 
 * 输出标准化的 violations[]，作为 Neptune 触发与 DecisionLog 的统一输入
 */

import { Injectable } from '@nestjs/common';
import {
  TripWorldState,
  ActivityCandidate,
  ISODate,
  ISOTime,
  GeoPoint,
} from '../world-model';
import { PlanSlot, PlanDay, TripPlan } from '../plan-model';

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface CheckerViolation {
  code: string;
  severity: ViolationSeverity;
  date?: ISODate;
  slotId?: string;
  activityId?: string;
  message: string;
  details?: Record<string, any>;
  suggestions?: string[];
}

export interface ConstraintCheckResult {
  violations: CheckerViolation[];
  isValid: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

/**
 * 约束校验器
 */
@Injectable()
export class ConstraintChecker {
  /**
   * 校验完整计划
   */
  checkPlan(state: TripWorldState, plan: TripPlan): ConstraintCheckResult {
    const violations: CheckerViolation[] = [];

    for (const day of plan.days) {
      // 1. 时间窗校验
      violations.push(...this.checkTimeWindows(state, day));

      // 2. 连通性校验
      violations.push(...this.checkConnectivity(state, day));

      // 3. 预算校验
      violations.push(...this.checkBudget(state, day));

      // 4. 体力/强度校验
      violations.push(...this.checkPhysicalConstraints(state, day));

      // 5. 天气可行性校验
      violations.push(...this.checkWeatherFeasibility(state, day));
    }

    // 6. 全局预算校验
    violations.push(...this.checkGlobalBudget(state, plan));

    // 7. Readiness 约束校验（如果存在）
    const readinessViolations = this.checkReadinessConstraints(state);
    violations.push(...readinessViolations);

    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const infoCount = violations.filter(v => v.severity === 'info').length;

    return {
      violations,
      isValid: errorCount === 0,
      summary: {
        errorCount,
        warningCount,
        infoCount,
      },
    };
  }

  /**
   * 7. Readiness 约束校验
   */
  private checkReadinessConstraints(state: TripWorldState): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    // 从 state 中获取 readiness 结果（如果存在）
    const readinessResult = (state as any).readinessResult;
    if (!readinessResult) {
      return violations;
    }

    // 使用 ReadinessToConstraintsCompiler 转换为 CheckerViolation
    // 注意：这里需要动态导入，避免循环依赖
    try {
      // 尝试从 readiness 模块获取编译器
      const { ReadinessToConstraintsCompiler } = require('../../readiness/compilers/readiness-to-constraints.compiler');
      const compiler = new ReadinessToConstraintsCompiler();
      
      // 为每个日期生成 violations（如果没有特定日期，使用第一个日期）
      const firstDate = state.context.startDate;
      const readinessViolations = compiler.toCheckerViolations(readinessResult, firstDate);
      
      violations.push(...readinessViolations);
    } catch (error) {
      // 如果导入失败，只记录警告，不阻断检查
      console.warn('Failed to check readiness constraints:', error);
    }

    return violations;
  }

  /**
   * 1. 时间窗校验
   */
  private checkTimeWindows(
    state: TripWorldState,
    day: PlanDay
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    for (const slot of day.timeSlots) {
      if (!slot.poiId || slot.type === 'rest' || slot.type === 'transport') {
        continue;
      }

      const candidate = candidateMap.get(slot.poiId);
      if (!candidate) continue;

      // 检查开放时间
      const openingHours = candidate.openingHours?.find(
        oh => oh.date === day.date
      );

      if (openingHours && openingHours.windows.length > 0) {
        const slotStart = this.timeToMinutes(slot.time);
        const slotEnd = slot.endTime
          ? this.timeToMinutes(slot.endTime)
          : slotStart + (candidate.durationMin || 60);

        const isWithinWindow = openingHours.windows.some(window => {
          const windowStart = this.timeToMinutes(window.start);
          const windowEnd = this.timeToMinutes(window.end);
          return slotStart >= windowStart && slotEnd <= windowEnd;
        });

        if (!isWithinWindow) {
          violations.push({
            code: 'TIME_WINDOW_VIOLATION',
            severity: 'error',
            date: day.date,
            slotId: slot.id,
            activityId: candidate.id,
            message: `活动 "${slot.title}" 不在开放时间窗内`,
            details: {
              slotTime: `${slot.time} - ${slot.endTime || '?'}`,
              openingWindows: openingHours.windows.map(
                w => `${w.start} - ${w.end}`
              ),
            },
            suggestions: [
              `调整到开放时间：${openingHours.windows[0].start} - ${openingHours.windows[0].end}`,
              '考虑替换为其他活动',
            ],
          });
        }
      }

      // 检查预约要求
      if (candidate.requiresBooking && !slot.locked) {
        violations.push({
          code: 'BOOKING_REQUIRED',
          severity: 'warning',
          date: day.date,
          slotId: slot.id,
          activityId: candidate.id,
          message: `活动 "${slot.title}" 需要预约，但尚未锁定`,
          suggestions: ['请提前预约或替换为无需预约的活动'],
        });
      }
    }

    return violations;
  }

  /**
   * 2. 连通性校验
   */
  private checkConnectivity(
    state: TripWorldState,
    day: PlanDay
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    for (let i = 1; i < day.timeSlots.length; i++) {
      const prevSlot = day.timeSlots[i - 1];
      const currSlot = day.timeSlots[i];

      if (!prevSlot.coordinates || !currSlot.coordinates) {
        continue;
      }

      const travelLeg = currSlot.travelLegFromPrev;
      if (!travelLeg) {
        // 没有旅行信息，可能是连续活动或休息
        continue;
      }

      // 检查旅行时间是否合理
      const prevEnd = prevSlot.endTime
        ? this.timeToMinutes(prevSlot.endTime)
        : this.timeToMinutes(prevSlot.time) + 60;
      const currStart = this.timeToMinutes(currSlot.time);
      const availableTime = currStart - prevEnd;

      if (availableTime < travelLeg.durationMin) {
        violations.push({
          code: 'CONNECTIVITY_INSUFFICIENT_TIME',
          severity: 'error',
          date: day.date,
          slotId: currSlot.id,
          message: `从 "${prevSlot.title}" 到 "${currSlot.title}" 的旅行时间不足`,
          details: {
            availableTimeMin: availableTime,
            requiredTimeMin: travelLeg.durationMin,
            deficitMin: travelLeg.durationMin - availableTime,
          },
          suggestions: [
            `增加 ${travelLeg.durationMin - availableTime} 分钟的缓冲时间`,
            '调整活动顺序以减少旅行时间',
            '考虑替换为更近的活动',
          ],
        });
      }

      // 检查可靠性
      if (travelLeg.reliability && travelLeg.reliability < 0.5) {
        violations.push({
          code: 'CONNECTIVITY_LOW_RELIABILITY',
          severity: 'warning',
          date: day.date,
          slotId: currSlot.id,
          message: `从 "${prevSlot.title}" 到 "${currSlot.title}" 的旅行时间可靠性较低`,
          details: {
            reliability: travelLeg.reliability,
            source: travelLeg.source,
          },
          suggestions: [
            '增加额外的缓冲时间',
            '准备备选路线',
          ],
        });
      }
    }

    return violations;
  }

  /**
   * 3. 预算校验（单日）
   */
  private checkBudget(
    state: TripWorldState,
    day: PlanDay
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    if (!state.context.budget) {
      return violations;
    }

    const dailyBudget = state.context.budget.amount / state.context.durationDays;
    let dayCost = 0;
    const currency = state.context.budget.currency;

    for (const slot of day.timeSlots) {
      if (slot.poiId) {
        const candidate = candidateMap.get(slot.poiId);
        if (candidate?.cost) {
          // 简单处理：假设货币一致或已转换
          dayCost += candidate.cost.amount;
        }
      }

      // 交通费用
      if (slot.travelLegFromPrev) {
        // 简单估算：假设交通费用已包含在预算中
        // 实际应该从 travelLeg 中获取
      }
    }

    const overrunRatio = dayCost / dailyBudget;
    const maxOverrun = state.policies?.maxBudgetOverrunRatio || 1.05;

    if (overrunRatio > maxOverrun) {
      violations.push({
        code: 'BUDGET_DAILY_OVERRUN',
        severity: overrunRatio > 1.2 ? 'error' : 'warning',
        date: day.date,
        message: `当日预算超支 ${((overrunRatio - 1) * 100).toFixed(1)}%`,
        details: {
          dailyBudget,
          actualCost: dayCost,
          overrunRatio,
          currency,
        },
        suggestions: [
          '移除部分可选活动',
          '替换为更便宜的活动',
          '调整其他天的预算分配',
        ],
      });
    }

    return violations;
  }

  /**
   * 4. 体力/强度校验
   */
  private checkPhysicalConstraints(
    state: TripWorldState,
    day: PlanDay
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    let totalActiveMinutes = 0;
    let totalTravelMinutes = 0;
    let maxRiskLevel: 'low' | 'medium' | 'high' | undefined;

    for (const slot of day.timeSlots) {
      if (slot.poiId) {
        const candidate = candidateMap.get(slot.poiId);
        if (candidate) {
          totalActiveMinutes += candidate.durationMin;
          if (candidate.riskLevel) {
            if (
              !maxRiskLevel ||
              (candidate.riskLevel === 'high' && maxRiskLevel !== 'high') ||
              (candidate.riskLevel === 'medium' && maxRiskLevel === 'low')
            ) {
              maxRiskLevel = candidate.riskLevel;
            }
          }
        }
      }

      if (slot.travelLegFromPrev) {
        totalTravelMinutes += slot.travelLegFromPrev.durationMin;
      }
    }

    const maxDailyActiveMinutes =
      state.context.preferences.maxDailyActiveMinutes ||
      (state.context.preferences.pace === 'relaxed'
        ? 240
        : state.context.preferences.pace === 'intense'
          ? 420
          : 330);

    if (totalActiveMinutes > maxDailyActiveMinutes) {
      violations.push({
        code: 'PHYSICAL_OVERLOAD',
        severity: 'warning',
        date: day.date,
        message: `当日活动强度超出推荐值`,
        details: {
          activeMinutes: totalActiveMinutes,
          maxRecommended: maxDailyActiveMinutes,
          travelMinutes: totalTravelMinutes,
          pace: state.context.preferences.pace,
        },
        suggestions: [
          '减少活动数量',
          '缩短部分活动停留时间',
          '增加休息时间',
        ],
      });
    }

    // 风险等级检查
    if (
      maxRiskLevel === 'high' &&
      state.context.preferences.riskTolerance === 'low'
    ) {
      violations.push({
        code: 'RISK_TOLERANCE_MISMATCH',
        severity: 'warning',
        date: day.date,
        message: `当日包含高风险活动，但用户风险偏好为低`,
        details: {
          maxRiskLevel,
          userRiskTolerance: state.context.preferences.riskTolerance,
        },
        suggestions: [
          '替换为低风险活动',
          '确认用户是否接受高风险活动',
        ],
      });
    }

    return violations;
  }

  /**
   * 5. 天气可行性校验
   */
  private checkWeatherFeasibility(
    state: TripWorldState,
    day: PlanDay
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];
    const candidates = state.candidatesByDate[day.date] || [];
    const candidateMap = new Map(candidates.map(c => [c.id, c]));

    const weather = state.signals.weatherByDate?.[day.date];
    const alerts = state.signals.alerts || [];

    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const hasBadWeather = criticalAlerts.length > 0 || weather?.condition === 'rain' || weather?.condition === 'storm';

    for (const slot of day.timeSlots) {
      if (!slot.poiId) continue;

      const candidate = candidateMap.get(slot.poiId);
      if (!candidate) continue;

      // 户外活动 + 坏天气
      if (
        candidate.indoorOutdoor === 'outdoor' &&
        hasBadWeather &&
        (candidate.weatherSensitivity || 0) >= 2
      ) {
        violations.push({
          code: 'WEATHER_UNSAFE',
          severity: 'error',
          date: day.date,
          slotId: slot.id,
          activityId: candidate.id,
          message: `户外活动 "${slot.title}" 受天气影响，可能不可行`,
          details: {
            weatherCondition: weather?.condition,
            alerts: criticalAlerts.map(a => a.message),
            weatherSensitivity: candidate.weatherSensitivity,
          },
          suggestions: [
            '替换为室内活动',
            '调整到天气较好的时段',
            '准备备选方案',
          ],
        });
      }
    }

    return violations;
  }

  /**
   * 6. 全局预算校验
   */
  private checkGlobalBudget(
    state: TripWorldState,
    plan: TripPlan
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    if (!state.context.budget) {
      return violations;
    }

    const totalBudget = state.context.budget.amount;
    const estimatedCost = plan.metrics?.estTotalCost || 0;
    const overrunRatio = estimatedCost / totalBudget;
    const maxOverrun = state.policies?.maxBudgetOverrunRatio || 1.05;

    if (overrunRatio > maxOverrun) {
      violations.push({
        code: 'BUDGET_GLOBAL_OVERRUN',
        severity: overrunRatio > 1.2 ? 'error' : 'warning',
        message: `总预算超支 ${((overrunRatio - 1) * 100).toFixed(1)}%`,
        details: {
          totalBudget,
          estimatedCost,
          overrunRatio,
          currency: state.context.budget.currency,
        },
        suggestions: [
          '减少活动数量',
          '替换为更便宜的活动',
          '调整预算分配',
        ],
      });
    }

    return violations;
  }

  /**
   * 工具方法：时间字符串转分钟数
   */
  private timeToMinutes(time: ISOTime): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}

