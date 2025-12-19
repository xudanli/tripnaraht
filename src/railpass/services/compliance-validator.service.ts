// src/railpass/services/compliance-validator.service.ts

/**
 * 合规验证服务
 * 
 * 验证行程计划是否符合 RailPass 规则
 * 包括：居住国使用次数、Travel Day 预算、订座强制要求等
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';
import { EligibilityEngineService } from './eligibility-engine.service';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';
import { ReservationOrchestrationService } from './reservation-orchestration.service';

interface ValidateComplianceInput {
  passProfile: RailPassProfile;
  segments: RailSegment[];
  reservationTasks?: ReservationTask[];
}

interface ComplianceViolation {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  segmentId?: string;
  details?: any;
}

interface ComplianceValidationResult {
  valid: boolean;
  violations: ComplianceViolation[];
  warnings: ComplianceViolation[];
}

@Injectable()
export class ComplianceValidatorService {
  private readonly logger = new Logger(ComplianceValidatorService.name);

  constructor(
    private readonly eligibilityEngine: EligibilityEngineService,
    private readonly travelDayCalculator: TravelDayCalculationEngineService,
    private readonly reservationOrchestrator: ReservationOrchestrationService,
  ) {}

  /**
   * 验证完整合规性
   */
  validateCompliance(input: ValidateComplianceInput): ComplianceValidationResult {
    const violations: ComplianceViolation[] = [];
    const warnings: ComplianceViolation[] = [];

    const { passProfile, segments, reservationTasks } = input;

    // 1. 验证居住国使用次数（Interrail）
    if (passProfile.passFamily === 'INTERRAIL') {
      const homeCountryValidation = this.eligibilityEngine.validateHomeCountryUsage({
        passFamily: passProfile.passFamily,
        residencyCountry: passProfile.residencyCountry,
        outboundUsed: passProfile.homeCountryOutboundUsed,
        inboundUsed: passProfile.homeCountryInboundUsed,
      });

      if (!homeCountryValidation.valid) {
        homeCountryValidation.violations.forEach(msg => {
          violations.push({
            code: 'HOME_COUNTRY_USAGE_EXCEEDED',
            severity: 'error',
            message: msg,
          });
        });
      }
    }

    // 2. 验证 Travel Day 预算（Flexi）
    if (passProfile.validityType === 'FLEXI' && passProfile.travelDaysTotal) {
      const travelDayResult = this.travelDayCalculator.calculateTravelDays({
        segments,
        passProfile,
      });

      if (travelDayResult.violations && travelDayResult.violations.length > 0) {
        travelDayResult.violations.forEach(v => {
          violations.push({
            code: 'TRAVEL_DAY_BUDGET_EXCEEDED',
            severity: 'error',
            message: v.message,
            details: {
              date: v.date,
            },
          });
        });
      }

      // 如果剩余 Travel Days 较少，给出警告
      if (travelDayResult.remainingDays !== undefined && travelDayResult.remainingDays < 2) {
        warnings.push({
          code: 'TRAVEL_DAY_BUDGET_LOW',
          severity: 'warning',
          message: `Travel Days 剩余较少（${travelDayResult.remainingDays} 天），建议检查行程安排`,
        });
      }
    }

    // 3. 验证订座强制要求
    if (reservationTasks) {
      const pendingTasks = this.reservationOrchestrator.getPendingTasks(reservationTasks);
      const neededTasks = pendingTasks.filter(t => t.status === 'NEEDED');

      if (neededTasks.length > 0) {
        // 必须订座但还未订的任务
        neededTasks.forEach(task => {
          const segment = segments.find(s => s.segmentId === task.segmentId);
          if (segment) {
            violations.push({
              code: 'RESERVATION_MANDATORY_NOT_BOOKED',
              severity: 'error',
              message: `Segment ${task.segmentId} 必须订座但尚未订座`,
              segmentId: task.segmentId,
              details: {
                isNightTrain: segment.isNightTrain,
                isHighSpeed: segment.isHighSpeed,
                isInternational: segment.isInternational,
              },
            });
          }
        });
      }
    }

    // 4. 验证 Pass 有效期
    for (const segment of segments) {
      const segmentDate = segment.departureDate;
      if (segmentDate < passProfile.validityStartDate || segmentDate > passProfile.validityEndDate) {
        violations.push({
          code: 'PASS_VALIDITY_EXCEEDED',
          severity: 'error',
          message: `Segment ${segment.segmentId} 的日期超出 Pass 有效期`,
          segmentId: segment.segmentId,
          details: {
            segmentDate,
            validityStart: passProfile.validityStartDate,
            validityEnd: passProfile.validityEndDate,
          },
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * 生成用户友好的解释
   */
  generateUserExplanation(result: ComplianceValidationResult): string {
    const parts: string[] = [];

    if (result.valid) {
      parts.push('✅ 行程符合 RailPass 规则');
    } else {
      parts.push('❌ 发现以下合规问题：');
      result.violations.forEach((v, idx) => {
        parts.push(`${idx + 1}. ${v.message}`);
      });
    }

    if (result.warnings.length > 0) {
      parts.push('\n⚠️ 警告：');
      result.warnings.forEach((w, idx) => {
        parts.push(`${idx + 1}. ${w.message}`);
      });
    }

    return parts.join('\n');
  }
}
