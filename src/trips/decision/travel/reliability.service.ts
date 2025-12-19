// src/trips/decision/travel/reliability.service.ts

/**
 * Travel 时间与可靠性体系
 * 
 * travelLeg 增加 reliability（置信度）和 worst-case（保守时耗）
 */

import { Injectable } from '@nestjs/common';
import { TravelLeg, GeoPoint } from '../world-model';

export interface ReliableTravelLeg extends TravelLeg {
  reliability: number;        // 0~1 置信度
  worstCaseDurationMin: number; // 保守时耗（分钟）
  confidence: 'high' | 'medium' | 'low';
}

export interface ReliabilityConfig {
  // 根据可靠性自动加 buffer
  bufferByReliability: {
    high: number;    // 高可靠性时的缓冲倍数
    medium: number;
    low: number;
  };
  // 固定缓冲（分钟）
  fixedBufferMin: number;
}

export const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig = {
  bufferByReliability: {
    high: 1.1,
    medium: 1.3,
    low: 1.5,
  },
  fixedBufferMin: 10,
};

@Injectable()
export class TravelReliabilityService {
  /**
   * 增强 travelLeg 的可靠性信息
   */
  enhanceReliability(
    leg: TravelLeg,
    config: ReliabilityConfig = DEFAULT_RELIABILITY_CONFIG
  ): ReliableTravelLeg {
    // 评估可靠性
    const reliability = this.assessReliability(leg);
    const confidence = this.reliabilityToConfidence(reliability);

    // 计算保守时耗
    const worstCaseDurationMin = this.calculateWorstCase(
      leg,
      reliability,
      config
    );

    return {
      ...leg,
      reliability,
      worstCaseDurationMin,
      confidence,
    };
  }

  /**
   * 评估可靠性
   */
  private assessReliability(leg: TravelLeg): number {
    // 如果已经有 reliability，直接使用
    if (leg.reliability !== undefined) {
      return leg.reliability;
    }

    // 根据 source 评估
    switch (leg.source) {
      case 'google_routes':
      case 'smart_routes':
        return 0.9; // API 返回，高可靠性
      case 'osrm':
        return 0.85;
      case 'heuristic':
        return 0.5; // 估算，低可靠性
      default:
        return 0.6; // 默认中等
    }
  }

  /**
   * 可靠性转置信度等级
   */
  private reliabilityToConfidence(
    reliability: number
  ): 'high' | 'medium' | 'low' {
    if (reliability >= 0.8) return 'high';
    if (reliability >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * 计算保守时耗
   */
  private calculateWorstCase(
    leg: TravelLeg,
    reliability: number,
    config: ReliabilityConfig
  ): number {
    const baseDuration = leg.durationMin;
    const confidence = this.reliabilityToConfidence(reliability);
    const bufferMultiplier = config.bufferByReliability[confidence];

    return Math.round(
      baseDuration * bufferMultiplier + config.fixedBufferMin
    );
  }

  /**
   * 根据可靠性自动调整缓冲
   */
  getRecommendedBuffer(
    leg: TravelLeg,
    config: ReliabilityConfig = DEFAULT_RELIABILITY_CONFIG
  ): number {
    const reliability = this.assessReliability(leg);
    const confidence = this.reliabilityToConfidence(reliability);
    const bufferMultiplier = config.bufferByReliability[confidence];

    return Math.round(
      leg.durationMin * (bufferMultiplier - 1) + config.fixedBufferMin
    );
  }
}

