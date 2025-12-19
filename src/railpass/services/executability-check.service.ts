// src/railpass/services/executability-check.service.ts

/**
 * 可执行性检查服务
 * 
 * 生成用于 UI 卡片展示的可执行性检查结果
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';
import {
  ExecutabilityCheckOverview,
  SegmentCardInfo,
  HighRiskAlert,
  SegmentCoverageStatus,
  RiskLevel,
} from '../interfaces/executability-check.interface';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';
import { ComplianceValidatorService } from './compliance-validator.service';
import { RailPassConstraintsService } from '../constraints/railpass-constraints.service';

interface CheckExecutabilityInput {
  passProfile: RailPassProfile;
  segments: RailSegment[];
  reservationTasks?: ReservationTask[];
  placeNames?: Map<number, { name: string; countryCode: string }>; // Place ID -> name mapping
}

@Injectable()
export class ExecutabilityCheckService {
  private readonly logger = new Logger(ExecutabilityCheckService.name);

  constructor(
    private readonly reservationEngine: ReservationDecisionEngineService,
    private readonly travelDayCalculator: TravelDayCalculationEngineService,
    private readonly complianceValidator: ComplianceValidatorService,
    private readonly constraintsService: RailPassConstraintsService,
  ) {}

  /**
   * 生成可执行性检查总览（B2）
   */
  async checkExecutability(input: CheckExecutabilityInput): Promise<ExecutabilityCheckOverview> {
    const { passProfile, segments, reservationTasks = [], placeNames } = input;

    // 生成段级卡片
    const segmentCards: SegmentCardInfo[] = [];
    let executableCount = 0;
    let needConfirmationCount = 0;
    let highRiskCount = 0;

    // Travel Day 计算（如果是 Flexi）
    let travelDayResult;
    if (passProfile.validityType === 'FLEXI' && passProfile.travelDaysTotal) {
      travelDayResult = this.travelDayCalculator.calculateTravelDays({
        segments,
        passProfile,
      });
    }

    for (const segment of segments) {
      const card = await this.generateSegmentCard({
        segment,
        passProfile,
        reservationTasks,
        travelDayResult,
        placeNames,
      });

      segmentCards.push(card);

      // 统计
      if (card.coverage === 'COVERED' && card.riskLevel !== 'HIGH') {
        executableCount++;
      } else if (card.coverage === 'UNKNOWN' || card.reservationInfo.status === 'UNKNOWN') {
        needConfirmationCount++;
      }
      if (card.riskLevel === 'HIGH') {
        highRiskCount++;
      }
    }

    // 检查缺失信息
    const missingInfo = this.checkMissingInfo(passProfile);

    // 汇总建议
    const summarySuggestions = this.generateSummarySuggestions({
      passProfile,
      segments,
      segmentCards,
      travelDayResult,
      missingInfo,
    });

    return {
      executableCount,
      needConfirmationCount,
      highRiskCount,
      estimatedTravelDaysUsed: travelDayResult ? {
        total: travelDayResult.totalDaysUsed,
        remaining: travelDayResult.remainingDays,
        explanation: `预计消耗 ${travelDayResult.totalDaysUsed} 天${travelDayResult.remainingDays !== undefined ? `，剩余 ${travelDayResult.remainingDays} 天` : ''}`,
      } : undefined,
      segments: segmentCards,
      summarySuggestions,
      hasIncompleteProfile: missingInfo.length > 0,
      missingInfo: missingInfo.length > 0 ? missingInfo : undefined,
    };
  }

  /**
   * 生成段级卡片（B3）
   */
  private async generateSegmentCard(args: {
    segment: RailSegment;
    passProfile: RailPassProfile;
    reservationTasks: ReservationTask[];
    travelDayResult?: any;
    placeNames?: Map<number, { name: string; countryCode: string }>;
  }): Promise<SegmentCardInfo> {
    const { segment, passProfile, reservationTasks, travelDayResult, placeNames } = args;

    // 覆盖状态
    const coverage = this.determineCoverage(segment, passProfile);

    // Travel Day 信息（Flexi）
    let travelDayInfo;
    if (passProfile.validityType === 'FLEXI' && travelDayResult) {
      const dayInfo = travelDayResult.daysByDate[segment.departureDate];
      if (dayInfo && dayInfo.consumed) {
        travelDayInfo = {
          consumed: true,
          daysConsumed: dayInfo.crossesMidnight ? 2 : 1,
          explanation: `Flexi 消耗 ${dayInfo.crossesMidnight ? 2 : 1} 天${dayInfo.crossesMidnight ? '（跨午夜）' : '（当天乘车）'}`,
        };
      }
    }

    // 订座信息
    const reservationRequirement = this.reservationEngine.checkReservation(segment);
    const task = reservationTasks.find(t => t.segmentId === segment.segmentId);

    let reservationStatus: SegmentCardInfo['reservationInfo']['status'];
    if (reservationRequirement.required) {
      reservationStatus = task?.status === 'BOOKED' ? 'REQUIRED' : 'REQUIRED';
    } else if (segment.isHighSpeed || segment.isInternational) {
      reservationStatus = 'UNKNOWN'; // 高铁/国际列车可能需订座，但不确定
    } else {
      reservationStatus = 'NOT_REQUIRED';
    }

    // 风险等级
    const riskLevel = this.determineRiskLevel({
      coverage,
      reservationRequirement,
      segment,
      passProfile,
      task,
    });

    // 关键建议
    const keySuggestions = this.generateKeySuggestions({
      segment,
      passProfile,
      reservationRequirement,
      task,
      travelDayInfo,
    });

    // 折叠详情
    const details = this.generateDetails({
      segment,
      passProfile,
      reservationRequirement,
      travelDayInfo,
    });

    // 获取地点名称
    const fromPlace = placeNames?.get(segment.fromPlaceId) || {
      name: `Place ${segment.fromPlaceId}`,
      countryCode: segment.fromCountryCode,
    };
    const toPlace = placeNames?.get(segment.toPlaceId) || {
      name: `Place ${segment.toPlaceId}`,
      countryCode: segment.toCountryCode,
    };

    return {
      segmentId: segment.segmentId,
      departureTime: segment.departureTimeWindow?.earliest || segment.departureDate,
      fromPlace,
      toPlace,
      coverage,
      travelDayInfo,
      reservationInfo: {
        status: reservationStatus,
        mandatoryReason: reservationRequirement.mandatoryReasonCode,
        feeEstimate: reservationRequirement.feeEstimate,
        riskLevel: reservationRequirement.quotaRisk,
        suggestions: this.generateReservationSuggestions(reservationRequirement, segment),
      },
      riskLevel,
      keySuggestions,
      details,
    };
  }

  /**
   * 确定覆盖状态
   */
  private determineCoverage(
    segment: RailSegment,
    passProfile: RailPassProfile
  ): SegmentCoverageStatus {
    // 检查 Pass 类型
    if (passProfile.passType === 'ONE_COUNTRY') {
      // One Country Pass：只有指定国家可用
      // 这里简化处理，实际需要知道 Pass 覆盖哪个国家
      return 'COVERED'; // 假设已过滤
    }

    // Global Pass：检查是否在 Pass 覆盖网络内
    // 这里简化处理，实际需要查询覆盖网络
    if (segment.isInternational) {
      return 'COVERED'; // Global Pass 通常覆盖国际段
    }

    // 检查 Pass 有效期
    const segmentDate = new Date(segment.departureDate);
    const validityStart = new Date(passProfile.validityStartDate);
    const validityEnd = new Date(passProfile.validityEndDate);

    if (segmentDate < validityStart || segmentDate > validityEnd) {
      return 'NOT_COVERED';
    }

    // 默认覆盖（需要进一步确认）
    return 'COVERED';
  }

  /**
   * 确定风险等级
   */
  private determineRiskLevel(args: {
    coverage: SegmentCoverageStatus;
    reservationRequirement: any;
    segment: RailSegment;
    passProfile: RailPassProfile;
    task?: ReservationTask;
  }): RiskLevel {
    const { coverage, reservationRequirement, segment, passProfile, task } = args;

    // 不覆盖 → HIGH
    if (coverage === 'NOT_COVERED') {
      return 'HIGH';
    }

    // 必须订座但未订 → HIGH
    if (reservationRequirement.required && task?.status !== 'BOOKED') {
      return 'HIGH';
    }

    // 订座配额风险高 → HIGH
    if (reservationRequirement.quotaRisk === 'HIGH') {
      return 'HIGH';
    }

    // 未知状态 → MEDIUM
    if (coverage === 'UNKNOWN' || reservationRequirement.quotaRisk === 'MEDIUM') {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * 生成关键建议
   */
  private generateKeySuggestions(args: {
    segment: RailSegment;
    passProfile: RailPassProfile;
    reservationRequirement: any;
    task?: ReservationTask;
    travelDayInfo?: any;
  }): string[] {
    const suggestions: string[] = [];
    const { segment, passProfile, reservationRequirement, task, travelDayInfo } = args;

    // Mobile Pass 建议
    if (passProfile.mobileOrPaper === 'MOBILE') {
      suggestions.push('上车前把该段 Journey 加入通票');
    }

    // 订座建议
    if (reservationRequirement.required && task?.status !== 'BOOKED') {
      suggestions.push('建议提前确认是否强制订座；订不到可换慢车/换时段');
    } else if (segment.isHighSpeed || segment.isInternational) {
      suggestions.push('建议提前确认是否强制订座');
    }

    return suggestions.slice(0, 2); // 最多 2 条
  }

  /**
   * 生成折叠详情
   */
  private generateDetails(args: {
    segment: RailSegment;
    passProfile: RailPassProfile;
    reservationRequirement: any;
    travelDayInfo?: any;
  }): SegmentCardInfo['details'] {
    const { segment, passProfile, reservationRequirement, travelDayInfo } = args;
    const details: SegmentCardInfo['details'] = {};

    // Mobile Pass 提醒
    if (passProfile.mobileOrPaper === 'MOBILE') {
      details.mobilePassReminders = [
        '需定期联网验证，离线过久可能导致 inactive',
        '每 24 小时必须联网一次',
      ];
    }

    // 旺季提醒
    if (reservationRequirement.quotaRisk === 'HIGH' || reservationRequirement.quotaRisk === 'MEDIUM') {
      details.peakSeasonWarnings = [
        '如为周末/节假日热门时段：可能售罄（建议提前订）',
      ];
    }

    // 夜车 Travel Day 规则解释
    if (travelDayInfo && travelDayInfo.daysConsumed === 2) {
      details.ruleExplanation = [
        '夜车跨午夜换乘会消耗 2 个 Travel Day',
        '直达夜车且午夜后不换乘通常只消耗 1 天',
      ];
    }

    return Object.keys(details).length > 0 ? details : undefined;
  }

  /**
   * 生成订座建议
   */
  private generateReservationSuggestions(requirement: any, segment: RailSegment): string[] {
    const suggestions: string[] = [];

    if (requirement.required) {
      suggestions.push(`必须订座（${requirement.mandatoryReasonCode}）`);
    }

    if (requirement.feeEstimate) {
      suggestions.push(`预估费用：${requirement.feeEstimate.min}-${requirement.feeEstimate.max} ${requirement.feeEstimate.currency}`);
    }

    return suggestions;
  }

  /**
   * 检查缺失信息
   */
  private checkMissingInfo(passProfile: RailPassProfile): string[] {
    const missing: string[] = [];

    if (!passProfile.mobileOrPaper) {
      missing.push('载体类型（mobile/paper）');
    }

    if (passProfile.validityType === 'FLEXI' && !passProfile.travelDaysTotal) {
      missing.push('Travel Days 总数');
    }

    return missing;
  }

  /**
   * 生成汇总建议
   */
  private generateSummarySuggestions(args: {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    segmentCards: SegmentCardInfo[];
    travelDayResult?: any;
    missingInfo: string[];
  }): string[] {
    const suggestions: string[] = [];
    const { passProfile, segmentCards, travelDayResult, missingInfo } = args;

    if (missingInfo.length > 0) {
      suggestions.push('建议补全通票信息以获得更准确的检查结果');
    }

    const highRiskCount = segmentCards.filter(c => c.riskLevel === 'HIGH').length;
    if (highRiskCount > 0) {
      suggestions.push(`有 ${highRiskCount} 个高风险段需要关注`);
    }

    if (travelDayResult && travelDayResult.remainingDays !== undefined) {
      if (travelDayResult.remainingDays < 2) {
        suggestions.push('Travel Days 剩余较少，建议检查行程安排');
      }
    }

    return suggestions;
  }

  /**
   * 生成高风险提示（B4）
   */
  async generateHighRiskAlerts(input: CheckExecutabilityInput): Promise<HighRiskAlert[]> {
    const { passProfile, segments, reservationTasks = [] } = input;
    const alerts: HighRiskAlert[] = [];

    // 合规验证
    const complianceResult = await this.complianceValidator.validateCompliance({
      passProfile,
      segments,
      reservationTasks,
    });

    // 检查各种高风险情况
    for (const violation of complianceResult.violations) {
      if (violation.severity === 'error') {
        const alert = this.createAlertFromViolation(violation, segments, passProfile);
        if (alert) {
          alerts.push(alert);
        }
      }
    }

    return alerts;
  }

  /**
   * 从违规创建告警
   */
  private createAlertFromViolation(
    violation: any,
    segments: RailSegment[],
    passProfile: RailPassProfile
  ): HighRiskAlert | null {
    const segmentId = violation.segmentId;
    const segment = segments.find(s => s.segmentId === segmentId);

    switch (violation.code) {
      case 'RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED':
      case 'RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED':
        return {
          type: 'HOME_COUNTRY_LIMIT',
          affectedSegmentIds: segmentId ? [segmentId] : [],
          explanation: `这段涉及居住国（${passProfile.residencyCountry}）境内使用。Interrail Global 通常只允许居住国 outbound/inbound 两次。`,
          alternatives: [
            {
              id: 'buy_separate_ticket',
              title: '这段改为单独买票',
              description: '不占用通票规则风险',
              impact: {
                costDelta: 50, // 假设单独买票费用
              },
            },
            {
              id: 'adjust_route',
              title: '调整路线',
              description: '把居住国境内行程集中在同一天作为 outbound/inbound 使用',
            },
          ],
          severity: 'error',
        };

      case 'RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED':
        return {
          type: 'TRAVEL_DAY_OVERUSE',
          affectedSegmentIds: [],
          explanation: `Travel Days 已超限。已用 ${violation.details?.totalDaysUsed} 天，Pass 仅 ${violation.details?.travelDaysTotal} 天。`,
          alternatives: [
            {
              id: 'reduce_segments',
              title: '减少 rail segments',
              description: '合并行程到同一 Travel Day',
            },
            {
              id: 'upgrade_pass',
              title: '升级到更多 Travel Days 的 Pass',
              description: '购买更多 Travel Days 的 Flexi Pass',
            },
          ],
          severity: 'error',
        };

      case 'RAILPASS_RESERVATION_MANDATORY':
        if (segment?.isNightTrain && segment?.crossesMidnight) {
          return {
            type: 'NIGHT_TRAIN_2_DAYS',
            affectedSegmentIds: [segmentId],
            explanation: '这趟夜车午夜后还有换乘，Flexi 可能会扣 2 个 Travel Day。',
            alternatives: [
              {
                id: 'direct_night_train',
                title: '换成直达夜车',
                description: '通常只扣出发日 1 天',
              },
              {
                id: 'day_train_plus_hotel',
                title: '改为白天车 + 晚上住宿',
                description: '更省 Travel Day',
                impact: {
                  travelDaysDelta: -1,
                  costDelta: 80, // 增加住宿费用
                },
              },
            ],
            severity: 'warning',
          };
        }
        return {
          type: 'RESERVATION_MANDATORY',
          affectedSegmentIds: [segmentId],
          explanation: violation.message,
          alternatives: [
            {
              id: 'book_reservation',
              title: '立即订座',
              description: '通过 Eurail/Interrail 平台或运营商订座',
            },
            {
              id: 'switch_to_slow_train',
              title: '选择备用路线（慢车）',
              description: '不需要订座，但耗时更长',
              impact: {
                timeDelta: 60,
              },
            },
          ],
          severity: 'error',
        };

      default:
        return null;
    }
  }
}
