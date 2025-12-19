// src/railpass/integrations/planning-policy-integration.service.ts

/**
 * PlanningPolicy 集成服务
 * 
 * 在 PlanningPolicy 的稳健度评估中集成订座失败风险/配额评估
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from '../services/reservation-orchestration.service';

/**
 * RailPass 稳健度指标
 */
export interface RailPassRobustnessMetrics {
  /** 订座失败风险概率（0-1） */
  reservationFailureRisk: number;
  
  /** 配额紧张段数量 */
  quotaRiskSegmentsCount: number;
  
  /** 必须订座但未订的段数量 */
  mandatoryReservationMissingCount: number;
  
  /** 总订座费用预估（EUR） */
  totalReservationFeeEstimate: {
    min: number;
    max: number;
    currency: string;
  };
  
  /** Travel Day 风险（Flexi Pass） */
  travelDayRisk?: {
    /** 已使用 Travel Days */
    daysUsed: number;
    /** 剩余 Travel Days */
    daysRemaining: number;
    /** 是否接近超限 */
    nearLimit: boolean;
  };
  
  /** 风险等级 */
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

@Injectable()
export class PlanningPolicyIntegrationService {
  private readonly logger = new Logger(PlanningPolicyIntegrationService.name);

  constructor(
    private readonly reservationEngine: ReservationDecisionEngineService,
    private readonly reservationOrchestrator: ReservationOrchestrationService,
  ) {}

  /**
   * 评估 RailPass 稳健度
   * 
   * 在 PlanningPolicy 的稳健度评估中，加入订座失败风险/配额评估
   */
  async evaluateRailPassRobustness(args: {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks: ReservationTask[];
    travelDaysUsed?: number;
    travelDaysTotal?: number;
  }): Promise<RailPassRobustnessMetrics> {
    const { passProfile, segments, reservationTasks, travelDaysUsed, travelDaysTotal } = args;

    // 1. 评估订座失败风险
    let reservationFailureRisk = 0;
    let quotaRiskSegmentsCount = 0;
    let mandatoryReservationMissingCount = 0;
    const feeEstimates: Array<{ min: number; max: number }> = [];

    for (const segment of segments) {
      const requirement = this.reservationEngine.checkReservation(segment);
      const task = reservationTasks.find(t => t.segmentId === segment.segmentId);

      // 如果必须订座
      if (requirement.required) {
        // 检查是否已订座
        if (!task || task.status !== 'BOOKED') {
          mandatoryReservationMissingCount++;

          // 根据配额风险估算失败概率
          switch (requirement.quotaRisk) {
            case 'HIGH':
              reservationFailureRisk += 0.4; // 高风险：40% 失败概率
              quotaRiskSegmentsCount++;
              break;
            case 'MEDIUM':
              reservationFailureRisk += 0.2; // 中风险：20% 失败概率
              quotaRiskSegmentsCount++;
              break;
            case 'LOW':
              reservationFailureRisk += 0.05; // 低风险：5% 失败概率
              break;
          }
        } else {
          // 已订座，但仍可能有风险（如旺季/临近出发）
          if (requirement.quotaRisk === 'HIGH') {
            reservationFailureRisk += 0.1; // 已订但高风险，仍可能有 10% 风险
          }
        }

        // 累积费用预估
        if (requirement.feeEstimate) {
          feeEstimates.push({
            min: requirement.feeEstimate.min,
            max: requirement.feeEstimate.max,
          });
        }
      }
    }

    // 归一化失败风险（最多不超过 1）
    reservationFailureRisk = Math.min(1, reservationFailureRisk / Math.max(1, segments.length));

    // 计算总费用预估
    const totalReservationFeeEstimate = {
      min: feeEstimates.reduce((sum, e) => sum + e.min, 0),
      max: feeEstimates.reduce((sum, e) => sum + e.max, 0),
      currency: 'EUR',
    };

    // 2. Travel Day 风险评估（Flexi Pass）
    let travelDayRisk: RailPassRobustnessMetrics['travelDayRisk'];
    if (passProfile.validityType === 'FLEXI' && travelDaysTotal && travelDaysUsed !== undefined) {
      const daysRemaining = travelDaysTotal - travelDaysUsed;
      const nearLimit = daysRemaining <= 2; // 剩余 2 天或更少视为接近超限

      travelDayRisk = {
        daysUsed: travelDaysUsed,
        daysRemaining,
        nearLimit,
      };
    }

    // 3. 综合风险等级
    let overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    if (mandatoryReservationMissingCount > 0) {
      // 有必须订座但未订的段 → 高风险
      overallRiskLevel = 'HIGH';
    } else if (quotaRiskSegmentsCount > 0 || reservationFailureRisk > 0.3) {
      // 配额紧张或失败风险高 → 中风险
      overallRiskLevel = 'MEDIUM';
    } else if (travelDayRisk?.nearLimit) {
      // Travel Day 接近超限 → 中风险
      overallRiskLevel = 'MEDIUM';
    }

    return {
      reservationFailureRisk,
      quotaRiskSegmentsCount,
      mandatoryReservationMissingCount,
      totalReservationFeeEstimate,
      travelDayRisk,
      overallRiskLevel,
    };
  }

  /**
   * 将 RailPass 稳健度指标转换为 PlanningPolicy 可以使用的风险惩罚
   * 
   * 用于在稳健度评估的分数计算中加入订座风险
   */
  convertToRiskPenalty(metrics: RailPassRobustnessMetrics): number {
    // 风险惩罚分数（0-1，越高表示风险越大，应该降低稳健度分数）
    let penalty = 0;

    // 订座失败风险惩罚
    penalty += metrics.reservationFailureRisk * 0.4; // 最高贡献 40% 惩罚

    // 必须订座但未订的惩罚
    if (metrics.mandatoryReservationMissingCount > 0) {
      penalty += 0.3; // 额外 30% 惩罚
    }

    // Travel Day 风险惩罚
    if (metrics.travelDayRisk?.nearLimit) {
      penalty += 0.2; // 额外 20% 惩罚
    }

    // 配额紧张段惩罚
    if (metrics.quotaRiskSegmentsCount > 0) {
      penalty += Math.min(0.1, metrics.quotaRiskSegmentsCount * 0.05); // 每个配额紧张段 5%，最高 10%
    }

    return Math.min(1, penalty); // 总惩罚不超过 1
  }

  /**
   * 生成稳健度改进建议
   */
  generateRobustnessImprovements(metrics: RailPassRobustnessMetrics): string[] {
    const suggestions: string[] = [];

    if (metrics.mandatoryReservationMissingCount > 0) {
      suggestions.push(`有 ${metrics.mandatoryReservationMissingCount} 个必须订座的段尚未订座，建议尽快订座`);
    }

    if (metrics.quotaRiskSegmentsCount > 0) {
      suggestions.push(`有 ${metrics.quotaRiskSegmentsCount} 个段订座配额紧张，建议提前订座或选择替代路线`);
    }

    if (metrics.reservationFailureRisk > 0.3) {
      suggestions.push(`订座失败风险较高（${(metrics.reservationFailureRisk * 100).toFixed(0)}%），建议准备备用方案`);
    }

    if (metrics.travelDayRisk?.nearLimit) {
      suggestions.push(`Travel Days 剩余较少（${metrics.travelDayRisk.daysRemaining} 天），建议优化行程安排`);
    }

    if (metrics.totalReservationFeeEstimate.max > 100) {
      suggestions.push(`订座费用预估较高（最多 ${metrics.totalReservationFeeEstimate.max} EUR），建议考虑替代方案`);
    }

    return suggestions;
  }
}
