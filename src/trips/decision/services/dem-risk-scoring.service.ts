// src/trips/decision/services/dem-risk-scoring.service.ts
/**
 * DEM 风险评分服务
 * 
 * P1.1.3: 风险评分进入Dr.Dre/Neptune
 * - 连续>3000m天数
 * - 连续上升>1200m
 * - 坡度集中区间
 * 
 * 功能：
 * 1. 计算活动候选的风险评分
 * 2. 计算计划的风险评分（基于连续高海拔天数等）
 * 3. 为Dr.Dre和Neptune提供风险权重
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ActivityCandidate } from '../world-model';
import { PlanDay, TripPlan } from '../plan-model';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';

export interface ActivityRiskScore {
  /** 活动ID */
  activityId: string;
  /** 总风险评分（0-100，越高越危险） */
  totalRiskScore: number;
  /** 高海拔风险（0-100） */
  altitudeRisk: number;
  /** 坡度风险（0-100） */
  slopeRisk: number;
  /** 连续上升风险（0-100） */
  consecutiveAscentRisk: number;
  /** 风险标志 */
  riskFlags: Array<{
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
  }>;
}

export interface PlanRiskScore {
  /** 计划总风险评分（0-100） */
  totalRiskScore: number;
  /** 连续高海拔天数 */
  consecutiveHighAltitudeDays: number;
  /** 连续上升高度（米） */
  consecutiveAscent: number;
  /** 坡度集中区间数量 */
  steepConcentratedSections: number;
  /** 每日风险评分 */
  dailyRiskScores: Array<{
    day: number;
    date: string;
    riskScore: number;
    maxElevation: number;
    totalAscent: number;
    riskFlags: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      message: string;
    }>;
  }>;
  /** 风险标志 */
  riskFlags: Array<{
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
  }>;
}

export interface RiskScoringConfig {
  /** 高海拔阈值（米），默认3000 */
  highAltitudeThreshold?: number;
  /** 连续高海拔天数阈值，默认3天 */
  consecutiveHighAltitudeDaysThreshold?: number;
  /** 连续上升阈值（米），默认1200 */
  consecutiveAscentThreshold?: number;
  /** 坡度集中区间阈值（百分比），默认15% */
  steepSlopeThreshold?: number;
  /** 坡度集中区间最小长度（米），默认500 */
  steepSectionMinLength?: number;
}

@Injectable()
export class DEMRiskScoringService {
  private readonly logger = new Logger(DEMRiskScoringService.name);

  constructor(
    @Optional() private readonly demElevationService?: DEMElevationService,
  ) {
    if (!demElevationService) {
      this.logger.warn('DEMElevationService not available. DEM risk scoring will be disabled.');
    }
  }

  /**
   * 计算单个活动的风险评分
   * 
   * @param activity 活动候选
   * @param previousElevation 前一个活动的海拔（用于计算连续上升）
   * @param config 配置参数
   * @returns 风险评分
   */
  async calculateActivityRiskScore(
    activity: ActivityCandidate,
    previousElevation?: number,
    config: RiskScoringConfig = {}
  ): Promise<ActivityRiskScore> {
    const {
      highAltitudeThreshold = 3000,
      consecutiveAscentThreshold = 1200,
      steepSlopeThreshold = 15,
    } = config;

    const riskFlags: Array<{ type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];
    let altitudeRisk = 0;
    let slopeRisk = 0;
    let consecutiveAscentRisk = 0;

    // 1. 获取活动海拔
    let elevation: number | null = null;
    if (activity.location?.point) {
      elevation = await this.demElevationService.getElevation(
        activity.location.point.lat,
        activity.location.point.lng
      );
    }

    // 2. 计算高海拔风险
    if (elevation !== null) {
      if (elevation >= highAltitudeThreshold) {
        const altitudeExcess = elevation - highAltitudeThreshold;
        altitudeRisk = Math.min(100, (altitudeExcess / 1000) * 100); // 每超过1000米增加100分

        if (elevation >= 4000) {
          riskFlags.push({
            type: 'HIGH_ALTITUDE',
            severity: 'HIGH',
            message: `海拔${elevation}m，存在严重高反风险`,
          });
        } else if (elevation >= 3500) {
          riskFlags.push({
            type: 'HIGH_ALTITUDE',
            severity: 'MEDIUM',
            message: `海拔${elevation}m，存在高反风险`,
          });
        } else {
          riskFlags.push({
            type: 'HIGH_ALTITUDE',
            severity: 'LOW',
            message: `海拔${elevation}m，需注意适应`,
          });
        }
      }

      // 3. 计算连续上升风险
      if (previousElevation !== undefined && elevation > previousElevation) {
        const ascent = elevation - previousElevation;
        if (ascent >= consecutiveAscentThreshold) {
          consecutiveAscentRisk = Math.min(100, (ascent / consecutiveAscentThreshold) * 50);
          riskFlags.push({
            type: 'RAPID_ASCENT',
            severity: ascent >= 2000 ? 'HIGH' : ascent >= 1500 ? 'MEDIUM' : 'LOW',
            message: `连续上升${ascent}m，超过阈值${consecutiveAscentThreshold}m`,
          });
        }
      }
    }

    // 4. 计算坡度风险（如果有metadata中的坡度信息）
    const slope = (activity as any).metadata?.slope || (activity as any).metadata?.avgSlope;
    if (slope !== undefined && Math.abs(slope) >= steepSlopeThreshold) {
      slopeRisk = Math.min(100, (Math.abs(slope) / steepSlopeThreshold) * 50);
      riskFlags.push({
        type: 'STEEP_SLOPE',
        severity: Math.abs(slope) >= 25 ? 'HIGH' : Math.abs(slope) >= 20 ? 'MEDIUM' : 'LOW',
        message: `坡度${slope.toFixed(1)}%，超过阈值${steepSlopeThreshold}%`,
      });
    }

    // 5. 计算总风险评分（加权平均）
    const totalRiskScore = Math.min(100, 
      altitudeRisk * 0.4 + 
      slopeRisk * 0.3 + 
      consecutiveAscentRisk * 0.3
    );

    return {
      activityId: activity.id,
      totalRiskScore: Math.round(totalRiskScore * 100) / 100,
      altitudeRisk: Math.round(altitudeRisk * 100) / 100,
      slopeRisk: Math.round(slopeRisk * 100) / 100,
      consecutiveAscentRisk: Math.round(consecutiveAscentRisk * 100) / 100,
      riskFlags,
    };
  }

  /**
   * 计算计划的风险评分
   * 
   * @param plan 旅行计划
   * @param routeSegmentation 路线拆段结果（可选）
   * @param config 配置参数
   * @returns 计划风险评分
   */
  async calculatePlanRiskScore(
    plan: TripPlan,
    routeSegmentation?: any,
    config: RiskScoringConfig = {}
  ): Promise<PlanRiskScore> {
    const {
      highAltitudeThreshold = 3000,
      consecutiveHighAltitudeDaysThreshold = 3,
      consecutiveAscentThreshold = 1200,
    } = config;

    const dailyRiskScores: PlanRiskScore['dailyRiskScores'] = [];
    let consecutiveHighAltitudeDays = 0;
    let maxConsecutiveHighAltitudeDays = 0;
    let consecutiveAscent = 0;
    let consecutiveAscentStartElevation: number | null = null;
    let steepConcentratedSections = 0;

    // 1. 计算每日风险评分
    for (let i = 0; i < plan.days.length; i++) {
      const day = plan.days[i];
      const terrainFacts = day.terrainFacts;

      // 获取当天的最高海拔和总爬升
      const maxElevation = terrainFacts?.maxElevation || 0;
      const totalAscent = terrainFacts?.totalAscent || 0;

      // 计算连续高海拔天数
      if (maxElevation >= highAltitudeThreshold) {
        consecutiveHighAltitudeDays++;
      } else {
        maxConsecutiveHighAltitudeDays = Math.max(
          maxConsecutiveHighAltitudeDays,
          consecutiveHighAltitudeDays
        );
        consecutiveHighAltitudeDays = 0;
      }

      // 计算连续上升
      if (maxElevation > 0) {
        if (consecutiveAscentStartElevation === null) {
          consecutiveAscentStartElevation = maxElevation;
        } else if (maxElevation > consecutiveAscentStartElevation) {
          consecutiveAscent = maxElevation - consecutiveAscentStartElevation;
        } else {
          // 如果下降，重置连续上升
          consecutiveAscentStartElevation = maxElevation;
          consecutiveAscent = 0;
        }
      }

      // 计算每日风险评分
      let dayRiskScore = 0;
      const dayRiskFlags: Array<{ type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];

      // 高海拔风险
      if (maxElevation >= highAltitudeThreshold) {
        const altitudeExcess = maxElevation - highAltitudeThreshold;
        dayRiskScore += Math.min(50, (altitudeExcess / 1000) * 50);
        
        if (maxElevation >= 4000) {
          dayRiskFlags.push({
            type: 'HIGH_ALTITUDE',
            severity: 'HIGH',
            message: `第${day.day}天最高海拔${maxElevation}m，存在严重高反风险`,
          });
        } else if (maxElevation >= 3500) {
          dayRiskFlags.push({
            type: 'HIGH_ALTITUDE',
            severity: 'MEDIUM',
            message: `第${day.day}天最高海拔${maxElevation}m，存在高反风险`,
          });
        }
      }

      // 连续上升风险
      if (totalAscent >= consecutiveAscentThreshold) {
        dayRiskScore += Math.min(30, (totalAscent / consecutiveAscentThreshold) * 30);
        dayRiskFlags.push({
          type: 'RAPID_ASCENT',
          severity: totalAscent >= 2000 ? 'HIGH' : totalAscent >= 1500 ? 'MEDIUM' : 'LOW',
          message: `第${day.day}天累计爬升${totalAscent}m，超过阈值${consecutiveAscentThreshold}m`,
        });
      }

      // 从terrainFacts中提取风险标志
      if (terrainFacts?.riskFlags) {
        dayRiskFlags.push(...terrainFacts.riskFlags);
      }

      dailyRiskScores.push({
        day: day.day,
        date: day.date,
        riskScore: Math.min(100, dayRiskScore),
        maxElevation,
        totalAscent,
        riskFlags: dayRiskFlags,
      });
    }

    // 更新最大连续高海拔天数
    maxConsecutiveHighAltitudeDays = Math.max(
      maxConsecutiveHighAltitudeDays,
      consecutiveHighAltitudeDays
    );

    // 2. 从拆段结果中提取坡度集中区间
    if (routeSegmentation && routeSegmentation.steepSections) {
      steepConcentratedSections = routeSegmentation.steepSections.length;
    }

    // 3. 计算计划总风险评分
    const avgDailyRisk = dailyRiskScores.length > 0
      ? dailyRiskScores.reduce((sum, d) => sum + d.riskScore, 0) / dailyRiskScores.length
      : 0;

    // 连续高海拔天数惩罚
    const consecutiveHighAltitudePenalty = maxConsecutiveHighAltitudeDays >= consecutiveHighAltitudeDaysThreshold
      ? Math.min(30, (maxConsecutiveHighAltitudeDays - consecutiveHighAltitudeDaysThreshold + 1) * 10)
      : 0;

    // 连续上升惩罚
    const consecutiveAscentPenalty = consecutiveAscent >= consecutiveAscentThreshold
      ? Math.min(20, (consecutiveAscent / consecutiveAscentThreshold) * 20)
      : 0;

    // 坡度集中区间惩罚
    const steepSectionsPenalty = steepConcentratedSections > 0
      ? Math.min(20, steepConcentratedSections * 5)
      : 0;

    const totalRiskScore = Math.min(100,
      avgDailyRisk * 0.4 +
      consecutiveHighAltitudePenalty +
      consecutiveAscentPenalty +
      steepSectionsPenalty
    );

    // 4. 生成计划级风险标志
    const planRiskFlags: Array<{ type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];

    if (maxConsecutiveHighAltitudeDays >= consecutiveHighAltitudeDaysThreshold) {
      planRiskFlags.push({
        type: 'CONSECUTIVE_HIGH_ALTITUDE',
        severity: maxConsecutiveHighAltitudeDays >= 5 ? 'HIGH' : 'MEDIUM',
        message: `连续${maxConsecutiveHighAltitudeDays}天高海拔（>${highAltitudeThreshold}m），存在高反风险`,
      });
    }

    if (consecutiveAscent >= consecutiveAscentThreshold) {
      planRiskFlags.push({
        type: 'CONSECUTIVE_ASCENT',
        severity: consecutiveAscent >= 2000 ? 'HIGH' : 'MEDIUM',
        message: `连续上升${consecutiveAscent}m，超过阈值${consecutiveAscentThreshold}m`,
      });
    }

    if (steepConcentratedSections > 0) {
      planRiskFlags.push({
        type: 'STEEP_CONCENTRATED_SECTIONS',
        severity: steepConcentratedSections >= 3 ? 'HIGH' : 'MEDIUM',
        message: `路线包含${steepConcentratedSections}个坡度集中区间`,
      });
    }

    return {
      totalRiskScore: Math.round(totalRiskScore * 100) / 100,
      consecutiveHighAltitudeDays: maxConsecutiveHighAltitudeDays,
      consecutiveAscent: Math.round(consecutiveAscent),
      steepConcentratedSections,
      dailyRiskScores,
      riskFlags: planRiskFlags,
    };
  }

  /**
   * 为Dr.Dre提供风险权重调整
   * 
   * @param activity 活动候选
   * @param previousElevation 前一个活动的海拔
   * @param config 配置参数
   * @returns 风险权重（0-1，越高越应该降低优先级）
   */
  async getRiskWeightForDrDre(
    activity: ActivityCandidate,
    previousElevation?: number,
    config: RiskScoringConfig = {}
  ): Promise<number> {
    const riskScore = await this.calculateActivityRiskScore(activity, previousElevation, config);
    
    // 将风险评分转换为权重（0-1）
    // 风险越高，权重越大（应该降低优先级）
    return riskScore.totalRiskScore / 100;
  }

  /**
   * 为Neptune提供风险权重调整
   * 
   * @param activity 活动候选
   * @param previousElevation 前一个活动的海拔
   * @param config 配置参数
   * @returns 风险权重（0-1，越高越应该避免选择）
   */
  async getRiskWeightForNeptune(
    activity: ActivityCandidate,
    previousElevation?: number,
    config: RiskScoringConfig = {}
  ): Promise<number> {
    const riskScore = await this.calculateActivityRiskScore(activity, previousElevation, config);
    
    // 将风险评分转换为权重（0-1）
    // 风险越高，权重越大（应该避免选择）
    return riskScore.totalRiskScore / 100;
  }
}

