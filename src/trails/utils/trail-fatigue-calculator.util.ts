// src/trails/utils/trail-fatigue-calculator.util.ts

import { PacingConfig } from '../../trips/interfaces/pacing-config.interface';

export interface TrailFatigueResult {
  /** 基础HP消耗（基于距离和爬升） */
  baseHpCost: number;
  /** 难度惩罚（高难度路线额外消耗） */
  difficultyPenalty: number;
  /** 海拔惩罚（高海拔额外消耗） */
  elevationPenalty: number;
  /** 总HP消耗 */
  totalHpCost: number;
  /** 预计耗时（分钟） */
  estimatedDurationMin: number;
  /** 是否超过体力限制 */
  exceedsLimit: boolean;
  /** 建议休息次数 */
  recommendedRestCount: number;
}

/**
 * Trail体力消耗计算器
 * 
 * 将Trail的距离、爬升、难度转换为HP消耗
 * 数学模型：
 * - 基础消耗 = 距离(km) × 2 + 爬升(m) / 100
 * - 难度惩罚 = 根据difficultyLevel调整
 * - 海拔惩罚 = 根据maxElevation调整
 */
export class TrailFatigueCalculator {
  /**
   * 计算Trail的体力消耗
   */
  static calculateFatigue(
    trail: {
      distanceKm: number;
      elevationGainM: number;
      maxElevationM?: number;
      difficultyLevel?: string;
      estimatedDurationHours?: number;
    },
    pacingConfig: PacingConfig
  ): TrailFatigueResult {
    // 1. 基础消耗：距离 + 爬升
    // 每公里消耗2 HP，每100米爬升消耗1 HP
    const baseHpCost = trail.distanceKm * 2 + trail.elevationGainM / 100;

    // 2. 难度惩罚
    const difficultyMultiplier = this.getDifficultyMultiplier(trail.difficultyLevel);
    const difficultyPenalty = baseHpCost * (difficultyMultiplier - 1);

    // 3. 海拔惩罚（高海拔额外消耗）
    const elevationMultiplier = this.getElevationMultiplier(trail.maxElevationM);
    const elevationPenalty = baseHpCost * (elevationMultiplier - 1);

    // 4. 总消耗
    const totalHpCost = baseHpCost + difficultyPenalty + elevationPenalty;

    // 5. 应用步行速度系数
    const adjustedHpCost = totalHpCost * pacingConfig.walk_speed_factor;

    // 6. 预计耗时（分钟）
    const estimatedDurationMin = trail.estimatedDurationHours
      ? trail.estimatedDurationHours * 60
      : this.estimateDuration(trail.distanceKm, trail.elevationGainM, pacingConfig);

    // 7. 检查是否超过限制
    const exceedsLimit = adjustedHpCost > pacingConfig.max_daily_hp * 0.8; // 超过80%上限

    // 8. 建议休息次数
    const recommendedRestCount = this.calculateRestCount(
      adjustedHpCost,
      estimatedDurationMin,
      pacingConfig
    );

    return {
      baseHpCost,
      difficultyPenalty,
      elevationPenalty,
      totalHpCost: adjustedHpCost,
      estimatedDurationMin,
      exceedsLimit,
      recommendedRestCount,
    };
  }

  /**
   * 获取难度系数
   */
  private static getDifficultyMultiplier(difficulty?: string): number {
    switch (difficulty) {
      case 'EASY':
        return 0.9; // 简单路线减少10%消耗
      case 'MODERATE':
        return 1.0; // 中等难度无惩罚
      case 'HARD':
        return 1.2; // 困难路线增加20%消耗
      case 'EXTREME':
        return 1.5; // 极限路线增加50%消耗
      default:
        return 1.0;
    }
  }

  /**
   * 获取海拔系数
   */
  private static getElevationMultiplier(maxElevationM?: number): number {
    if (!maxElevationM) return 1.0;

    // 分段线性插值
    if (maxElevationM < 1500) return 1.0;
    if (maxElevationM < 2500) return 1.05;
    if (maxElevationM < 3000) return 1.10;
    if (maxElevationM < 3500) return 1.20;
    if (maxElevationM < 4000) return 1.30;
    if (maxElevationM < 4500) return 1.45;
    if (maxElevationM < 5000) return 1.60;
    if (maxElevationM < 5500) return 1.80;
    if (maxElevationM < 6000) return 2.10;
    if (maxElevationM < 7000) return 2.50;
    return 3.0; // 7000m以上
  }

  /**
   * 估算耗时（分钟）
   */
  private static estimateDuration(
    distanceKm: number,
    elevationGainM: number,
    pacingConfig: PacingConfig
  ): number {
    // 基础速度：4 km/h（平路）
    // 爬升速度：每100米爬升增加15分钟
    const baseTime = (distanceKm / 4) * 60; // 分钟
    const elevationTime = (elevationGainM / 100) * 15; // 分钟

    // 应用步行速度系数
    const totalTime = (baseTime + elevationTime) * pacingConfig.walk_speed_factor;

    return Math.ceil(totalTime);
  }

  /**
   * 计算建议休息次数
   */
  private static calculateRestCount(
    hpCost: number,
    durationMin: number,
    pacingConfig: PacingConfig
  ): number {
    // 如果消耗超过50%上限，建议至少休息1次
    if (hpCost > pacingConfig.max_daily_hp * 0.5) {
      const restInterval = pacingConfig.forced_rest_interval_min || 120;
      const restCount = Math.floor(durationMin / restInterval);
      return Math.max(1, restCount);
    }

    return 0;
  }

  /**
   * 检查Trail是否适合用户的体力配置
   */
  static isTrailSuitable(
    trail: {
      distanceKm: number;
      elevationGainM: number;
      maxElevationM?: number;
      difficultyLevel?: string;
    },
    pacingConfig: PacingConfig
  ): {
    suitable: boolean;
    reason?: string;
    fatigueResult: TrailFatigueResult;
  } {
    const fatigueResult = this.calculateFatigue(trail, pacingConfig);

    // 检查是否超过体力限制
    if (fatigueResult.exceedsLimit) {
      return {
        suitable: false,
        reason: `该路线预计消耗 ${fatigueResult.totalHpCost.toFixed(1)} HP，超过您的体力上限（${pacingConfig.max_daily_hp} HP）的80%`,
        fatigueResult,
      };
    }

    // 检查地形限制
    if (pacingConfig.terrain_filter === 'NO_STAIRS' && trail.elevationGainM > 500) {
      return {
        suitable: false,
        reason: '该路线包含大量爬升，不适合您的身体状况',
        fatigueResult,
      };
    }

    if (pacingConfig.terrain_filter === 'WHEELCHAIR_ONLY') {
      return {
        suitable: false,
        reason: '该路线不适合轮椅通行',
        fatigueResult,
      };
    }

    return {
      suitable: true,
      fatigueResult,
    };
  }
}

