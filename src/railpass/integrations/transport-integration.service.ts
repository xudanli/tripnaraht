// src/railpass/integrations/transport-integration.service.ts

/**
 * Transport 层集成服务
 * 
 * 在 Transport 层集成 RailPass 约束，使 rail mode 支持订座要求
 */

import { Injectable, Logger } from '@nestjs/common';
import { TransportOption, TransportMode } from '../../transport/interfaces/transport.interface';
import {
  RailPassProfile,
  RailSegment,
} from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';

/**
 * 增强的 Rail Transport Option（带订座信息）
 */
export interface EnhancedRailTransportOption extends TransportOption {
  mode: TransportMode.RAIL;
  
  /** RailPass 相关信息 */
  railPassInfo?: {
    /** Pass 是否覆盖此路线 */
    covered: boolean;
    
    /** 是否需要订座 */
    reservationRequired: boolean;
    
    /** 订座费用预估 */
    reservationFeeEstimate?: {
      min: number;
      max: number;
      currency: string;
    };
    
    /** 订座风险等级 */
    reservationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    
    /** 是否消耗 Travel Day（Flexi Pass） */
    consumesTravelDay?: boolean;
  };
}

@Injectable()
export class TransportIntegrationService {
  private readonly logger = new Logger(TransportIntegrationService.name);

  constructor(
    private readonly reservationEngine: ReservationDecisionEngineService,
  ) {}

  /**
   * 为 Transport Option 添加 RailPass 信息
   * 
   * 当 transport mode 为 RAIL 时，检查是否需要订座、费用预估等
   */
  async enhanceRailTransportOption(
    transportOption: TransportOption,
    passProfile?: RailPassProfile,
    segmentHint?: Partial<RailSegment>
  ): Promise<EnhancedRailTransportOption> {
    if (transportOption.mode !== TransportMode.RAIL) {
      // 非 rail mode，返回原样
      return transportOption as EnhancedRailTransportOption;
    }

    // 如果没有 passProfile，返回基础信息
    if (!passProfile) {
      return {
        ...transportOption,
        mode: TransportMode.RAIL,
        railPassInfo: {
          covered: false, // 未知
          reservationRequired: false, // 未知
          reservationRisk: 'LOW',
        },
      };
    }

    // 构建 segment（用于检查订座需求）
    const segment: RailSegment = {
      segmentId: `transport_${Date.now()}`,
      fromPlaceId: 0, // 占位
      toPlaceId: 0,
      fromCountryCode: segmentHint?.fromCountryCode || '',
      toCountryCode: segmentHint?.toCountryCode || '',
      departureDate: segmentHint?.departureDate || new Date().toISOString().split('T')[0],
      isNightTrain: segmentHint?.isNightTrain || false,
      isHighSpeed: segmentHint?.isHighSpeed || false,
      isInternational: segmentHint?.isInternational || 
        (segmentHint?.fromCountryCode !== segmentHint?.toCountryCode),
    };

    // 检查订座需求
    const reservationRequirement = this.reservationEngine.checkReservation(segment);

    // 检查 Pass 覆盖（简化：假设 Global Pass 覆盖所有欧洲铁路）
    const covered = this.checkPassCoverage(passProfile, segment);

    // 检查是否消耗 Travel Day（Flexi Pass）
    const consumesTravelDay = passProfile.validityType === 'FLEXI';

    return {
      ...transportOption,
      mode: TransportMode.RAIL,
      railPassInfo: {
        covered,
        reservationRequired: reservationRequirement.required || false,
        reservationFeeEstimate: reservationRequirement.feeEstimate,
        reservationRisk: reservationRequirement.quotaRisk,
        consumesTravelDay,
      },
    };
  }

  /**
   * 检查 Pass 是否覆盖此路线
   */
  private checkPassCoverage(
    passProfile: RailPassProfile,
    segment: RailSegment
  ): boolean {
    // 检查有效期
    const segmentDate = new Date(segment.departureDate);
    const validityStart = new Date(passProfile.validityStartDate);
    const validityEnd = new Date(passProfile.validityEndDate);

    if (segmentDate < validityStart || segmentDate > validityEnd) {
      return false;
    }

    // One Country Pass：只覆盖指定国家
    if (passProfile.passType === 'ONE_COUNTRY') {
      // 需要知道 Pass 覆盖哪个国家（这里简化处理）
      // 实际应该从 passProfile 获取 oneCountryCode
      return segment.fromCountryCode === segment.toCountryCode;
    }

    // Global Pass：覆盖欧洲铁路网络
    // 简化：假设覆盖所有跨国或国际段
    return true;
  }

  /**
   * 过滤不符合 RailPass 约束的 Transport Options
   */
  filterOptionsByRailPassConstraints(
    options: TransportOption[],
    passProfile?: RailPassProfile,
    constraints?: {
      avoidMandatoryReservations?: boolean;
      maxReservationFee?: number;
    }
  ): TransportOption[] {
    if (!passProfile) {
      return options; // 没有 Pass，不过滤
    }

    return options.filter(option => {
      if (option.mode !== TransportMode.RAIL) {
        return true; // 非 rail mode，保留
      }

      // 如果是 rail mode，需要检查约束
      // 这里简化处理，实际应该先调用 enhanceRailTransportOption
      // 然后根据 railPassInfo 过滤

      return true; // 暂时保留所有选项
    });
  }

  /**
   * 推荐符合 RailPass 的最佳 Transport Option
   */
  recommendBestRailOption(
    options: TransportOption[],
    passProfile?: RailPassProfile,
    preferences?: {
      preferNoReservation?: boolean;
      minimizeCost?: boolean;
      minimizeTime?: boolean;
    }
  ): TransportOption | null {
    const railOptions = options.filter(opt => opt.mode === TransportMode.RAIL);

    if (railOptions.length === 0) {
      return null;
    }

    // 评分逻辑
    const score = (option: TransportOption): number => {
      let score = 0;

      // 偏好不需要订座
      if (preferences?.preferNoReservation) {
        // 需要检查订座需求（简化处理）
        score += 10;
      }

      // 偏好低成本
      if (preferences?.minimizeCost) {
        score -= (option.cost || 0) / 10;
      }

      // 偏好快速
      if (preferences?.minimizeTime) {
        score -= (option.durationMinutes || 0) / 10;
      }

      return score;
    };

    // 按评分排序
    railOptions.sort((a, b) => score(b) - score(a));

    return railOptions[0] || null;
  }
}
