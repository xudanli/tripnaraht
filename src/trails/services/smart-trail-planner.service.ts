// src/trails/services/smart-trail-planner.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TrailsService } from '../trails.service';
import { TrailFatigueCalculator } from '../utils/trail-fatigue-calculator.util';
import { PacingConfig } from '../../trips/interfaces/pacing-config.interface';

export interface SmartTrailPlanRequest {
  /** 目标景点ID列表 */
  placeIds: number[];
  /** 用户体力配置 */
  pacingConfig: PacingConfig;
  /** 偏好设置 */
  preferences?: {
    /** 最大总距离（公里） */
    maxTotalDistanceKm?: number;
    /** 最大单段距离（公里） */
    maxSegmentDistanceKm?: number;
    /** 优先难度等级 */
    preferredDifficulty?: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
    /** 是否优先非公路步道 */
    preferOffRoad?: boolean;
    /** 是否允许拆分长路线 */
    allowSplit?: boolean;
  };
}

export interface SmartTrailPlanResult {
  /** 推荐的Trail组合 */
  trails: Array<{
    trailId: number;
    trail: any;
    matchScore: number;
    fatigueResult: any;
    suitable: boolean;
    recommendation: string;
  }>;
  /** 总体评估 */
  summary: {
    totalDistanceKm: number;
    totalElevationGainM: number;
    totalDurationHours: number;
    totalHpCost: number;
    exceedsLimit: boolean;
    recommendedRestCount: number;
    suitabilityScore: number; // 0-100
  };
  /** 建议的行程安排 */
  suggestedSchedule: Array<{
    day: number;
    trailIds: number[];
    distanceKm: number;
    durationHours: number;
    restCount: number;
  }>;
}

/**
 * 智能路线规划服务
 * 
 * 根据用户体力和偏好，自动规划最优的景点+轨迹组合
 */
@Injectable()
export class SmartTrailPlannerService {
  constructor(
    private prisma: PrismaService,
    private trailsService: TrailsService
  ) {}

  /**
   * 生成智能路线规划
   */
  async planSmartRoute(request: SmartTrailPlanRequest): Promise<SmartTrailPlanResult> {
    const { placeIds, pacingConfig, preferences = {} } = request;

    // 1. 获取Trail推荐
    const recommendations = await this.trailsService.recommendTrailsForPlaces(
      placeIds,
      {
        maxDistance: preferences.maxSegmentDistanceKm,
        preferOffRoad: preferences.preferOffRoad,
        maxDifficulty: preferences.preferredDifficulty,
      }
    );

    // 2. 评估每个Trail的适合性
    const evaluatedTrails = await Promise.all(
      recommendations.map(async (rec: any) => {
        const suitability = await this.trailsService.checkTrailSuitability(
          rec.trail.id,
          {
            max_daily_hp: pacingConfig.max_daily_hp,
            walk_speed_factor: pacingConfig.walk_speed_factor,
            terrain_filter: pacingConfig.terrain_filter,
          }
        );

        const fatigueResult = TrailFatigueCalculator.calculateFatigue(
          {
            distanceKm: rec.trail.distanceKm,
            elevationGainM: rec.trail.elevationGainM,
            maxElevationM: rec.trail.maxElevationM || undefined,
            difficultyLevel: rec.trail.difficultyLevel || undefined,
            estimatedDurationHours: rec.trail.estimatedDurationHours || undefined,
          },
          pacingConfig
        );

        return {
          trailId: rec.trail.id,
          trail: rec.trail,
          matchScore: rec.matchScore,
          fatigueResult,
          suitable: suitability.suitable,
          recommendation: rec.recommendation,
        };
      })
    );

    // 3. 过滤不适合的Trail
    const suitableTrails = evaluatedTrails.filter(t => t.suitable);

    // 4. 计算总体评估
    const summary = this.calculateSummary(suitableTrails, pacingConfig);

    // 5. 检查是否超过限制
    if (preferences?.maxTotalDistanceKm && summary.totalDistanceKm > preferences.maxTotalDistanceKm) {
      // 如果超过总距离限制，尝试拆分或选择更短的路线
      return this.optimizeForDistanceLimit(
        suitableTrails,
        preferences.maxTotalDistanceKm,
        pacingConfig,
        preferences
      );
    }

    // 6. 生成建议的行程安排
    const suggestedSchedule = this.generateSchedule(
      suitableTrails,
      pacingConfig,
      preferences || {}
    );

    return {
      trails: suitableTrails,
      summary,
      suggestedSchedule,
    };
  }

  /**
   * 计算总体评估
   */
  private calculateSummary(
    trails: SmartTrailPlanResult['trails'],
    pacingConfig: PacingConfig
  ): SmartTrailPlanResult['summary'] {
    const totalDistanceKm = trails.reduce((sum, t) => sum + t.trail.distanceKm, 0);
    const totalElevationGainM = trails.reduce((sum, t) => sum + t.trail.elevationGainM, 0);
    const totalDurationHours = trails.reduce(
      (sum, t) => sum + (t.trail.estimatedDurationHours || 0),
      0
    );
    const totalHpCost = trails.reduce((sum, t) => sum + t.fatigueResult.totalHpCost, 0);
    const exceedsLimit = totalHpCost > pacingConfig.max_daily_hp * 0.8;
    const recommendedRestCount = trails.reduce(
      (sum, t) => sum + t.fatigueResult.recommendedRestCount,
      0
    );

    // 计算适合度分数（0-100）
    const suitabilityScore = this.calculateSuitabilityScore(
      totalHpCost,
      pacingConfig.max_daily_hp,
      totalDurationHours,
      trails.length
    );

    return {
      totalDistanceKm,
      totalElevationGainM,
      totalDurationHours,
      totalHpCost,
      exceedsLimit,
      recommendedRestCount,
      suitabilityScore,
    };
  }

  /**
   * 计算适合度分数
   */
  private calculateSuitabilityScore(
    totalHpCost: number,
    maxHp: number,
    totalDurationHours: number,
    trailCount: number
  ): number {
    // 基础分数：100分
    let score = 100;

    // HP消耗惩罚（超过50%开始扣分）
    const hpRatio = totalHpCost / maxHp;
    if (hpRatio > 0.5) {
      score -= (hpRatio - 0.5) * 100; // 每超过10%扣10分
    }

    // 时长惩罚（超过8小时开始扣分）
    if (totalDurationHours > 8) {
      score -= (totalDurationHours - 8) * 5; // 每超过1小时扣5分
    }

    // Trail数量奖励（多个Trail串联有奖励）
    if (trailCount > 1) {
      score += Math.min(trailCount * 5, 20); // 最多加20分
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 优化距离限制
   */
  private optimizeForDistanceLimit(
    trails: SmartTrailPlanResult['trails'],
    maxDistanceKm: number,
    pacingConfig: PacingConfig,
    preferences?: SmartTrailPlanRequest['preferences']
  ): SmartTrailPlanResult {
    // 按匹配度排序，优先选择匹配度高的短路线
    const sortedTrails = [...trails].sort((a, b) => {
      // 优先：匹配度高 + 距离短
      const scoreA = a.matchScore * 100 - a.trail.distanceKm;
      const scoreB = b.matchScore * 100 - b.trail.distanceKm;
      return scoreB - scoreA;
    });

    // 贪心选择：选择匹配度最高且不超过距离限制的Trail
    const selectedTrails: SmartTrailPlanResult['trails'] = [];
    let currentDistance = 0;

    for (const trail of sortedTrails) {
      if (currentDistance + trail.trail.distanceKm <= maxDistanceKm) {
        selectedTrails.push(trail);
        currentDistance += trail.trail.distanceKm;
      }
    }

    const summary = this.calculateSummary(selectedTrails, pacingConfig);
    const suggestedSchedule = this.generateSchedule(selectedTrails, pacingConfig, preferences || {});

    return {
      trails: selectedTrails,
      summary,
      suggestedSchedule,
    };
  }

  /**
   * 生成建议的行程安排
   */
  private generateSchedule(
    trails: SmartTrailPlanResult['trails'],
    pacingConfig: PacingConfig,
    preferences: SmartTrailPlanRequest['preferences']
  ): SmartTrailPlanResult['suggestedSchedule'] {
    if (trails.length === 0) {
      return [];
    }

    // 如果允许拆分或路线较长，尝试分配到多天
    const maxDailyHp = pacingConfig.max_daily_hp;
    const schedule: SmartTrailPlanResult['suggestedSchedule'] = [];
    let currentDay = 1;
    let currentDayHp = 0;
    let currentDayTrails: number[] = [];
    let currentDayDistance = 0;
    let currentDayDuration = 0;
    let currentDayRestCount = 0;

    for (const trailInfo of trails) {
      const trailHp = trailInfo.fatigueResult.totalHpCost;
      const trailDuration = trailInfo.trail.estimatedDurationHours || 0;

      // 检查是否可以加入当天
      if (
        currentDayHp + trailHp <= maxDailyHp * 0.8 && // 不超过80%上限
        currentDayDuration + trailDuration <= 8 && // 不超过8小时
        (!preferences?.maxSegmentDistanceKm ||
          currentDayDistance + trailInfo.trail.distanceKm <= preferences.maxSegmentDistanceKm)
      ) {
        // 可以加入当天
        currentDayTrails.push(trailInfo.trailId);
        currentDayHp += trailHp;
        currentDayDistance += trailInfo.trail.distanceKm;
        currentDayDuration += trailDuration;
        currentDayRestCount += trailInfo.fatigueResult.recommendedRestCount;
      } else {
        // 需要新的一天
        if (currentDayTrails.length > 0) {
          schedule.push({
            day: currentDay,
            trailIds: currentDayTrails,
            distanceKm: currentDayDistance,
            durationHours: currentDayDuration,
            restCount: currentDayRestCount,
          });
        }

        // 开始新的一天
        currentDay++;
        currentDayTrails = [trailInfo.trailId];
        currentDayHp = trailHp;
        currentDayDistance = trailInfo.trail.distanceKm;
        currentDayDuration = trailDuration;
        currentDayRestCount = trailInfo.fatigueResult.recommendedRestCount;
      }
    }

    // 添加最后一天
    if (currentDayTrails.length > 0) {
      schedule.push({
        day: currentDay,
        trailIds: currentDayTrails,
        distanceKm: currentDayDistance,
        durationHours: currentDayDuration,
        restCount: currentDayRestCount,
      });
    }

    return schedule;
  }
}

