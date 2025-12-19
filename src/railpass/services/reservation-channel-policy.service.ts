// src/railpass/services/reservation-channel-policy.service.ts

/**
 * 订座渠道策略服务
 * 
 * 根据国家/运营商配置订座渠道和策略
 */

import { Injectable, Logger } from '@nestjs/common';
import { RailSegment } from '../interfaces/railpass.interface';
import { ReservationChannel } from '../interfaces/railpass.interface';

/**
 * 订座渠道策略
 */
export interface ReservationChannelPolicy {
  /** 国家代码 */
  countryCode: string;
  
  /** 运营商（可选，如果指定则仅适用于该运营商） */
  operator?: string;
  
  /** 推荐的订座渠道（优先级从高到低） */
  preferredChannels: ReservationChannel[];
  
  /** 是否支持 API 订座 */
  supportsApiBooking: boolean;
  
  /** 是否支持在线订座（跳转链接） */
  supportsOnlineBooking: boolean;
  
  /** 是否必须线下订座（车站/代理） */
  requiresOfflineBooking: boolean;
  
  /** 订座 URL（如果支持在线订座） */
  bookingUrl?: string;
  
  /** 订座说明 */
  instructions: string;
  
  /** 提前订座建议（天数） */
  recommendedAdvanceDays?: number;
}

@Injectable()
export class ReservationChannelPolicyService {
  private readonly logger = new Logger(ReservationChannelPolicyService.name);

  /**
   * 国家/运营商订座渠道策略配置
   */
  private readonly channelPolicies: ReservationChannelPolicy[] = [
    // Eurostar（重要：热门线路，建议尽早订）
    {
      countryCode: 'GB',
      operator: 'Eurostar',
      preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
      supportsApiBooking: false,
      supportsOnlineBooking: true,
      requiresOfflineBooking: false,
      bookingUrl: 'https://www.eurostar.com',
      instructions: 'Eurostar 建议尽早订座，passholder seats 配额有限，售罄后只能买全价票',
      recommendedAdvanceDays: 60, // 建议提前 60 天
    },
    // 法国（SNCF）
    {
      countryCode: 'FR',
      operator: 'SNCF',
      preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
      supportsApiBooking: false,
      supportsOnlineBooking: true,
      requiresOfflineBooking: false,
      bookingUrl: 'https://www.sncf.com',
      instructions: '可通过 Eurail/Interrail 平台或 SNCF 官网订座',
      recommendedAdvanceDays: 30,
    },
    // 德国（DB）
    {
      countryCode: 'DE',
      operator: 'DB',
      preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
      supportsApiBooking: false,
      supportsOnlineBooking: true,
      requiresOfflineBooking: false,
      bookingUrl: 'https://www.bahn.de',
      instructions: '可通过 Eurail/Interrail 平台或 DB 官网订座',
      recommendedAdvanceDays: 14,
    },
    // 意大利（Trenitalia）
    {
      countryCode: 'IT',
      operator: 'Trenitalia',
      preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
      supportsApiBooking: false,
      supportsOnlineBooking: true,
      requiresOfflineBooking: false,
      instructions: '可通过 Eurail/Interrail 平台或 Trenitalia 官网订座，部分线路可在车站订座',
      recommendedAdvanceDays: 14,
    },
    // 西班牙（Renfe）
    {
      countryCode: 'ES',
      operator: 'Renfe',
      preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct'],
      supportsApiBooking: false,
      supportsOnlineBooking: true,
      requiresOfflineBooking: false,
      instructions: '可通过 Eurail/Interrail 平台或 Renfe 官网订座',
      recommendedAdvanceDays: 14,
    },
    // 默认策略（其他国家）
    {
      countryCode: '*',
      preferredChannels: ['EURail_Interrail_Platform', 'Operator_Direct', 'Third_Party'],
      supportsApiBooking: false,
      supportsOnlineBooking: true,
      requiresOfflineBooking: false,
      instructions: '建议通过 Eurail/Interrail 官方平台订座，或直接在运营商官网/车站订座',
      recommendedAdvanceDays: 7,
    },
  ];

  /**
   * 获取 segment 的订座渠道策略
   */
  getChannelPolicy(segment: RailSegment): ReservationChannelPolicy {
    // 优先匹配运营商
    if (segment.operatorHint) {
      const operatorPolicy = this.channelPolicies.find(
        p => p.operator && segment.operatorHint?.toUpperCase().includes(p.operator.toUpperCase())
      );
      if (operatorPolicy) {
        return operatorPolicy;
      }
    }

    // 匹配国家
    const countryPolicy = this.channelPolicies.find(
      p => p.countryCode === segment.fromCountryCode || p.countryCode === segment.toCountryCode
    );
    if (countryPolicy) {
      return countryPolicy;
    }

    // 返回默认策略
    return this.channelPolicies.find(p => p.countryCode === '*') || this.channelPolicies[this.channelPolicies.length - 1];
  }

  /**
   * 生成订座清单（用于 UI）
   */
  generateBookingChecklist(segments: RailSegment[]): Array<{
    segmentId: string;
    from: string;
    to: string;
    policy: ReservationChannelPolicy;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH';
    bookingDeadline?: string; // ISO date
  }> {
    return segments.map(segment => {
      const policy = this.getChannelPolicy(segment);
      
      // 计算紧迫性
      let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      const segmentDate = new Date(segment.departureDate);
      const now = new Date();
      const daysUntilDeparture = Math.ceil((segmentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDeparture < policy.recommendedAdvanceDays!) {
        urgency = daysUntilDeparture < policy.recommendedAdvanceDays! / 2 ? 'HIGH' : 'MEDIUM';
      }

      // 计算订座截止日期
      const bookingDeadline = policy.recommendedAdvanceDays
        ? new Date(segmentDate.getTime() - policy.recommendedAdvanceDays * 24 * 60 * 60 * 1000)
        : undefined;

      return {
        segmentId: segment.segmentId,
        from: `${segment.fromCountryCode}`,
        to: `${segment.toCountryCode}`,
        policy,
        urgency,
        bookingDeadline: bookingDeadline?.toISOString().split('T')[0],
      };
    });
  }
}
