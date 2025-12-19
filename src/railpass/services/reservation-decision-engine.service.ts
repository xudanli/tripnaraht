// src/railpass/services/reservation-decision-engine.service.ts

/**
 * 订座决策引擎 (Reservation Requirement & Strategy Engine)
 * 
 * 根据 rail segment 的特征（夜车/高铁/跨国）判断是否需要订座
 * 评估费用、风险等级、订座渠道，并提供备用方案
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailSegment,
  ReservationRequirement,
  FallbackOption,
  MandatoryReservationReason,
  ReservationRiskLevel,
  ReservationChannel,
} from '../interfaces/railpass.interface';

/**
 * 需要订座的高铁运营商/路线（部分列表，可根据实际情况扩展）
 */
const HIGH_SPEED_OPERATORS = [
  'TGV', 'Thalys', 'Eurostar', 'ICE', 'AVE', 'Frecciarossa', 
  'EuroCity', 'Railjet', 'Pendolino',
];

@Injectable()
export class ReservationDecisionEngineService {
  private readonly logger = new Logger(ReservationDecisionEngineService.name);

  /**
   * 检查单个 segment 的订座需求
   */
  checkReservation(segment: RailSegment): ReservationRequirement {
    // 1. 判断是否必须订座
    const mandatoryReason = this.checkMandatoryReservation(segment);
    const required = !!mandatoryReason;

    // 2. 估算费用
    const feeEstimate = this.estimateReservationFee(segment, required);

    // 3. 评估配额风险
    const quotaRisk = this.assessQuotaRisk(segment);

    // 4. 确定订座渠道
    const bookingChannels = this.determineBookingChannels(segment);

    // 5. 风险因素说明
    const riskFactors = this.collectRiskFactors(segment, quotaRisk);

    return {
      required,
      mandatoryReasonCode: mandatoryReason,
      feeEstimate,
      quotaRisk,
      bookingChannels,
      riskFactors,
    };
  }

  /**
   * 检查是否必须订座
   * 
   * 规则：
   * - 夜车：强制订座
   * - 高铁/国际列车：多数需要订座（但非绝对强制，取决于运营商）
   * - 跨国列车：多数需要订座
   */
  private checkMandatoryReservation(
    segment: RailSegment
  ): MandatoryReservationReason | undefined {
    // 夜车强制订座
    if (segment.isNightTrain) {
      return 'NIGHT_TRAIN';
    }

    // 高铁多数需要订座
    if (segment.isHighSpeed) {
      return 'HIGH_SPEED';
    }

    // 国际列车多数需要订座
    if (segment.isInternational) {
      return 'INTERNATIONAL';
    }

    // 运营商特定政策（如果提供了 operatorHint）
    if (segment.operatorHint) {
      const operator = segment.operatorHint.toUpperCase();
      if (HIGH_SPEED_OPERATORS.some(op => operator.includes(op))) {
        return 'OPERATOR_POLICY';
      }
    }

    return undefined;
  }

  /**
   * 估算订座费用
   * 
   * 根据路线类型、距离、运营商估算费用范围（EUR）
   */
  private estimateReservationFee(
    segment: RailSegment,
    required: boolean
  ): ReservationRequirement['feeEstimate'] {
    if (!required) {
      return undefined;
    }

    // 费用估算（EUR）
    let min = 0;
    let max = 0;

    if (segment.isNightTrain) {
      // 夜车：铺位费用较高
      min = 20;
      max = 150; // 取决于舱位类型（座位/卧铺/包厢）
    } else if (segment.isHighSpeed || segment.isInternational) {
      // 高铁/国际列车：标准订座费
      min = 3;
      max = 30; // 取决于路线和运营商
    } else {
      // 其他情况：较低费用
      min = 0;
      max = 10;
    }

    return {
      min,
      max,
      currency: 'EUR',
    };
  }

  /**
   * 评估配额风险
   * 
   * 根据路线类型、时间段、旺季等因素评估配额紧张程度
   */
  private assessQuotaRisk(segment: RailSegment): ReservationRiskLevel {
    let riskScore = 0;

    // 夜车风险较高
    if (segment.isNightTrain) {
      riskScore += 2;
    }

    // 高铁/国际列车风险中等
    if (segment.isHighSpeed || segment.isInternational) {
      riskScore += 1;
    }

    // 旺季判断（简化：7-8 月为旺季）
    if (segment.departureDate) {
      const month = new Date(segment.departureDate).getMonth() + 1;
      if (month === 7 || month === 8) {
        riskScore += 1;
      }
    }

    // 临近出发风险较高（如果 departureTimeWindow 很近）
    if (segment.departureTimeWindow) {
      const now = new Date();
      const earliest = new Date(segment.departureTimeWindow.earliest);
      const daysUntilDeparture = Math.ceil((earliest.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDeparture < 7) {
        riskScore += 2;
      } else if (daysUntilDeparture < 30) {
        riskScore += 1;
      }
    }

    // 转换为风险等级
    if (riskScore >= 4) {
      return 'HIGH';
    } else if (riskScore >= 2) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 确定订座渠道
   */
  private determineBookingChannels(segment: RailSegment): ReservationChannel[] {
    const channels: ReservationChannel[] = [];

    // Eurail/Interrail 官方平台（推荐）
    channels.push('EURail_Interrail_Platform');

    // 运营商直接订座（某些情况下更便宜或更快）
    if (segment.isHighSpeed || segment.isInternational) {
      channels.push('Operator_Direct');
    }

    // 第三方平台（作为备选）
    channels.push('Third_Party');

    return channels;
  }

  /**
   * 收集风险因素说明
   */
  private collectRiskFactors(
    segment: RailSegment,
    quotaRisk: ReservationRiskLevel
  ): string[] {
    const factors: string[] = [];

    if (segment.isNightTrain) {
      factors.push('夜车强制订座，铺位有限');
    }

    if (segment.isHighSpeed) {
      factors.push('高铁多数需要订座');
    }

    if (segment.isInternational) {
      factors.push('国际列车建议提前订座');
    }

    if (quotaRisk === 'HIGH') {
      factors.push('配额紧张，建议尽快订座');
    } else if (quotaRisk === 'MEDIUM') {
      factors.push('建议提前订座');
    }

    // 旺季提示
    if (segment.departureDate) {
      const month = new Date(segment.departureDate).getMonth() + 1;
      if (month === 7 || month === 8) {
        factors.push('旺季期间，订座需求较高');
      }
    }

    return factors;
  }

  /**
   * 生成备用方案
   * 
   * 当订座失败或不可行时，提供替代方案
   */
  generateFallbackOptions(segment: RailSegment): FallbackOption[] {
    const options: FallbackOption[] = [];

    // 1. 改乘不需订座的慢车
    if (segment.isHighSpeed) {
      options.push({
        optionId: `${segment.segmentId}_slow_train`,
        type: 'SWITCH_TO_SLOW_TRAIN',
        description: '改乘区域列车（不需订座，但耗时更长）',
        timeDeltaMinutes: 60, // 假设慢车多花 1 小时
        costDeltaEur: 0, // 慢车不需要额外费用
      });
    }

    // 2. 换时段（避开高峰）
    options.push({
      optionId: `${segment.segmentId}_shift_time`,
      type: 'SHIFT_TIME',
      description: '调整出发时间（避开高峰时段）',
      timeDeltaMinutes: 0, // 时间变化取决于具体时段
    });

    // 3. 换路线
    options.push({
      optionId: `${segment.segmentId}_change_route`,
      type: 'CHANGE_ROUTE',
      description: '选择其他路线（可能经过不同城市）',
      timeDeltaMinutes: 30, // 假设路线变化导致时间变化
    });

    // 4. 拆段（将长段拆成多个短段）
    if (segment.isNightTrain) {
      options.push({
        optionId: `${segment.segmentId}_split`,
        type: 'SPLIT_SEGMENT',
        description: '将夜车拆成日间列车 + 住宿',
        costDeltaEur: 50, // 增加住宿费用
      });
    }

    // 5. 换交通方式：飞机
    options.push({
      optionId: `${segment.segmentId}_flight`,
      type: 'REPLACE_WITH_FLIGHT',
      description: '改乘飞机（可能更快，但费用更高）',
      costDeltaEur: 100, // 飞机通常更贵
      timeDeltaMinutes: -120, // 飞机可能更快
    });

    // 6. 换交通方式：巴士
    options.push({
      optionId: `${segment.segmentId}_bus`,
      type: 'REPLACE_WITH_BUS',
      description: '改乘长途巴士（经济实惠，但耗时更长）',
      costDeltaEur: -20, // 巴士通常更便宜
      timeDeltaMinutes: 90, // 巴士通常更慢
    });

    return options;
  }
}
