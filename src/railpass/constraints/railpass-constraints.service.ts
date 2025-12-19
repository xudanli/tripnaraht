// src/railpass/constraints/railpass-constraints.service.ts

/**
 * RailPass Constraints Service
 * 
 * 为 Decision 层提供 RailPass 相关的约束检查
 */

import { Injectable, Logger } from '@nestjs/common';
import { CheckerViolation } from '../../trips/decision/constraints/constraint-checker';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';
import { ComplianceValidatorService } from '../services/compliance-validator.service';
import { PassCoverageCheckerService } from '../services/pass-coverage-checker.service';

@Injectable()
export class RailPassConstraintsService {
  private readonly logger = new Logger(RailPassConstraintsService.name);

  constructor(
    private readonly complianceValidator: ComplianceValidatorService,
    private readonly coverageChecker: PassCoverageCheckerService,
  ) {}

  /**
   * C_reservation_mandatory: 若 required=true 且未 booked，则 schedule 不可执行（error）
   */
  checkReservationMandatory(
    segments: RailSegment[],
    reservationTasks: ReservationTask[]
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    for (const task of reservationTasks) {
      if (task.status === 'NEEDED') {
        const segment = segments.find(s => s.segmentId === task.segmentId);
        if (segment) {
          violations.push({
            code: 'RAILPASS_RESERVATION_MANDATORY',
            severity: 'error',
            message: `Rail segment ${task.segmentId} 必须订座但尚未订座`,
            slotId: task.segmentId,
            details: {
              segmentId: task.segmentId,
              isNightTrain: segment.isNightTrain,
              isHighSpeed: segment.isHighSpeed,
              isInternational: segment.isInternational,
            },
            suggestions: [
              '立即订座',
              '选择备用路线（慢车）',
              '调整出发时间',
            ],
          });
        }
      }
    }

    return violations;
  }

  /**
   * C_home_country_rule: Interrail 居住国使用次数不得超限
   */
  checkHomeCountryRule(
    passProfile: RailPassProfile
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    if (passProfile.passFamily !== 'INTERRAIL') {
      return violations; // Eurail 无居住国限制
    }

    if (passProfile.homeCountryOutboundUsed > 1) {
      violations.push({
        code: 'RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED',
        severity: 'error',
        message: `Interrail 在居住国 ${passProfile.residencyCountry} 的 outbound 使用次数超限（已用 ${passProfile.homeCountryOutboundUsed}，最多 1 次）`,
        details: {
          residencyCountry: passProfile.residencyCountry,
          outboundUsed: passProfile.homeCountryOutboundUsed,
          maxAllowed: 1,
        },
        suggestions: [
          '移除多余的居住国 outbound 段',
          '改用其他交通方式（飞机/巴士）',
        ],
      });
    }

    if (passProfile.homeCountryInboundUsed > 1) {
      violations.push({
        code: 'RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED',
        severity: 'error',
        message: `Interrail 在居住国 ${passProfile.residencyCountry} 的 inbound 使用次数超限（已用 ${passProfile.homeCountryInboundUsed}，最多 1 次）`,
        details: {
          residencyCountry: passProfile.residencyCountry,
          inboundUsed: passProfile.homeCountryInboundUsed,
          maxAllowed: 1,
        },
        suggestions: [
          '移除多余的居住国 inbound 段',
          '改用其他交通方式（飞机/巴士）',
        ],
      });
    }

    return violations;
  }

  /**
   * C_travel_day_budget: Flexi Pass 的 Travel Days 使用不得超限
   */
  checkTravelDayBudget(
    passProfile: RailPassProfile,
    segments: RailSegment[],
    travelDayResult: {
      totalDaysUsed: number;
      remainingDays?: number;
    }
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    if (passProfile.validityType !== 'FLEXI' || !passProfile.travelDaysTotal) {
      return violations; // Continuous Pass 不涉及 Travel Day
    }

    if (travelDayResult.totalDaysUsed > passProfile.travelDaysTotal) {
      violations.push({
        code: 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED',
        severity: 'error',
        message: `Travel Days 超限：已用 ${travelDayResult.totalDaysUsed} 天，Pass 仅 ${passProfile.travelDaysTotal} 天`,
        details: {
          totalDaysUsed: travelDayResult.totalDaysUsed,
          travelDaysTotal: passProfile.travelDaysTotal,
          overage: travelDayResult.totalDaysUsed - passProfile.travelDaysTotal,
        },
        suggestions: [
          '减少 rail segments',
          '合并行程到同一 Travel Day',
          '升级到更多 Travel Days 的 Pass',
        ],
      });
    } else if (travelDayResult.remainingDays !== undefined && travelDayResult.remainingDays < 2) {
      violations.push({
        code: 'RAILPASS_TRAVEL_DAY_BUDGET_LOW',
        severity: 'warning',
        message: `Travel Days 剩余较少（${travelDayResult.remainingDays} 天），建议检查行程安排`,
        details: {
          remainingDays: travelDayResult.remainingDays,
          travelDaysTotal: passProfile.travelDaysTotal,
        },
        suggestions: [
          '确认所有必需的行程都在计划内',
          '考虑升级 Pass',
        ],
      });
    }

    return violations;
  }

  /**
   * C_reservation_budget: 订座费累计不得超预算（或超了给 warning + 降级策略）
   */
  checkReservationBudget(
    reservationTasks: ReservationTask[],
    maxBudget?: number
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    if (!maxBudget) {
      return violations; // 无预算限制
    }

    const totalCost = reservationTasks
      .filter(t => t.cost !== undefined)
      .reduce((sum, t) => sum + (t.cost || 0), 0);

    // 估算未订座任务的费用（使用预估最大值）
    // 这里简化处理，实际应该从 ReservationRequirement 获取预估费用
    const estimatedPendingCost = reservationTasks
      .filter(t => t.status === 'NEEDED' || t.status === 'PLANNED')
      .length * 30; // 假设每个任务平均 30 EUR

    const totalEstimatedCost = totalCost + estimatedPendingCost;

    if (totalEstimatedCost > maxBudget) {
      const overage = totalEstimatedCost - maxBudget;
      violations.push({
        code: 'RAILPASS_RESERVATION_BUDGET_EXCEEDED',
        severity: totalEstimatedCost > maxBudget * 1.2 ? 'error' : 'warning',
        message: `订座费用预估超过预算：预计 ${totalEstimatedCost.toFixed(2)} EUR，预算 ${maxBudget} EUR（超支 ${overage.toFixed(2)} EUR）`,
        details: {
          totalEstimatedCost,
          maxBudget,
          overage,
          currency: 'EUR',
        },
        suggestions: [
          '选择不需订座的慢车路线',
          '调整行程避开夜车/高铁',
          '增加订座预算',
        ],
      });
    }

    return violations;
  }

  /**
   * C_pass_coverage: 检查 Pass 是否覆盖该线路
   */
  checkPassCoverage(
    segment: RailSegment,
    passProfile: RailPassProfile
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    const coverageResult = this.coverageChecker.checkCoverage(segment, passProfile);

    if (!coverageResult.covered) {
      violations.push({
        code: 'RAILPASS_COVERAGE_NOT_COVERED',
        severity: 'error',
        message: `Segment ${segment.segmentId} 不在 Pass 覆盖范围内`,
        slotId: segment.segmentId,
        details: {
          segmentId: segment.segmentId,
          coverageStatus: coverageResult.status,
          explanation: coverageResult.explanation,
        },
        suggestions: coverageResult.alternatives?.map(alt => alt.description) || [
          '选择其他覆盖的路线',
          '单独购买该段车票',
        ],
      });
    } else if (coverageResult.status === 'UNKNOWN') {
      violations.push({
        code: 'RAILPASS_COVERAGE_UNKNOWN',
        severity: 'warning',
        message: `Segment ${segment.segmentId} 的覆盖状态未知，建议确认`,
        slotId: segment.segmentId,
        details: {
          segmentId: segment.segmentId,
          explanation: coverageResult.explanation,
        },
        suggestions: [
          '查看 Rail Planner 确认覆盖状态',
          '咨询官方客服',
        ],
      });
    }

    return violations;
  }

  /**
   * C_last_day_night_train: 最后一天不能乘坐跨日夜车
   */
  checkLastDayNightTrain(
    segment: RailSegment,
    passProfile: RailPassProfile
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    const validityEndDate = new Date(passProfile.validityEndDate);
    const segmentDate = new Date(segment.departureDate);
    const isLastDay = segmentDate.getTime() === validityEndDate.getTime();

    if (isLastDay && segment.isNightTrain && segment.crossesMidnight) {
      violations.push({
        code: 'RAILPASS_LAST_DAY_NIGHT_TRAIN',
        severity: 'error',
        message: `Pass 在有效期最后一天 23:59 过期，不能乘坐需要跨到次日的夜车`,
        slotId: segment.segmentId,
        details: {
          segmentId: segment.segmentId,
          validityEndDate: passProfile.validityEndDate,
          segmentDate: segment.departureDate,
        },
        suggestions: [
          '改为白天车',
          '提前一天出发',
          '选择不需要跨午夜的夜车',
        ],
      });
    }

    return violations;
  }

  /**
   * 综合检查所有 RailPass 约束
   */
  checkAllConstraints(args: {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks: ReservationTask[];
    travelDayResult?: {
      totalDaysUsed: number;
      remainingDays?: number;
    };
    maxReservationBudget?: number;
  }): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    // 1. Pass 覆盖检查
    for (const segment of args.segments) {
      violations.push(
        ...this.checkPassCoverage(segment, args.passProfile)
      );
      violations.push(
        ...this.checkLastDayNightTrain(segment, args.passProfile)
      );
    }

    // 2. 订座强制要求
    violations.push(
      ...this.checkReservationMandatory(args.segments, args.reservationTasks)
    );

    // 3. 居住国规则
    violations.push(
      ...this.checkHomeCountryRule(args.passProfile)
    );

    // 4. Travel Day 预算
    if (args.travelDayResult) {
      violations.push(
        ...this.checkTravelDayBudget(
          args.passProfile,
          args.segments,
          args.travelDayResult
        )
      );
    }

    // 5. 订座预算
    violations.push(
      ...this.checkReservationBudget(
        args.reservationTasks,
        args.maxReservationBudget
      )
    );

    return violations;
  }
}
