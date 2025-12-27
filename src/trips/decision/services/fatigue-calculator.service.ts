// src/trips/decision/services/fatigue-calculator.service.ts
/**
 * Fatigue Calculator Service
 * 
 * 疲劳指数计算服务
 */

import { Injectable } from '@nestjs/common';
import { DayProfile, PaceConstraints } from '../interfaces/day-profile.interface';

@Injectable()
export class FatigueCalculatorService {
  /**
   * 计算疲劳指数
   * 
   * 经验区间：
   * - fatigueIndex <= 0.8：很轻松
   * - 0.8 < fatigueIndex <= 1.1：合理
   * - 1.1 < fatigueIndex <= 1.4：偏紧张（建议优化）
   * - > 1.4：高负荷（Dr.Dre 必须出手）
   */
  computeFatigueIndex(day: DayProfile, pace: PaceConstraints): number {
    const ascentRatio = day.totalAscentM / pace.maxDailyAscentM; // >1 = 超标
    const distRatio = day.totalDistanceKm / pace.maxDailyDistanceKm;
    const hoursRatio = day.estMovingHours / pace.maxMovingHours;

    // 惩罚偏"硬"的那一项
    const base = Math.max(ascentRatio, distRatio, hoursRatio);

    // 细调：坡度高再加一点
    const slopePenalty = day.maxSlopePct > 20 ? 0.1 : 0;

    return base + slopePenalty;
  }

  /**
   * 估算移动时间（小时）
   * 
   * 粗略估算：距离/速度 + 爬升/爬升速度
   */
  estimateMovingHours(distanceKm: number, ascentM: number): number {
    // 4km/h 平路速度 + 600m/小时爬升速度
    return distanceKm / 4 + ascentM / 600;
  }
}

