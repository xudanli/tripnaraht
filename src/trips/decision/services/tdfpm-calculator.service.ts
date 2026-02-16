/**
 * TDFPM - 旅行驾驶疲劳预测模型 (Travel Driving Fatigue Prediction Model)
 *
 * FatigueScore = DrivingLoad + CognitiveLoad + CircadianPenalty + EnvironmentPenalty − RestRecovery − SleepRecovery
 * RiskIndex = FatigueScore × WeatherRisk × NightFactor × RoadComplexity
 */

import { Injectable } from '@nestjs/common';
import { ROAD_INTENSITY_MAP } from '../optimization/learning/guardian-persona.interface';

export type TdfpmRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'DANGEROUS';
export type TdfpmRecommendation = 'OK' | 'REST_SOON' | 'REST_NOW' | 'SPLIT_DAY' | 'STOP_DRIVING';

export interface TdfpmDayContext {
  /** 驾驶小时数 */
  drivingHours: number;
  /** 道路类型描述（用于匹配 ROAD_INTENSITY_MAP） */
  roadType?: string;
  /** 出发时段（小时 0-23，用于 CircadianPenalty） */
  departureHour?: number;
  /** 天气惩罚 0-15（晴=0, 雨=5, 暴雨/雪=15, 强风=10） */
  weatherPenalty?: number;
  /** 海拔（米，AltitudePenalty = elev/1000*5） */
  altitudeM?: number;
  /** 认知负荷 0-20（熟悉=2, 海外=8, 赶时间=10） */
  cognitiveLoad?: number;
  /** 休息分钟数 */
  breakMinutes?: number;
  /** 是否有午睡（+15 恢复） */
  hasNap?: boolean;
  /** 前一晚睡眠小时数（SleepRecovery = (h/8)*20） */
  sleepHours?: number;
}

export interface TdfpmResult {
  fatigueScore: number;
  riskLevel: TdfpmRiskLevel;
  recommendation: TdfpmRecommendation;
  drivingLoad: number;
  nextBreakInMinutes?: number;
  confidence: number;
}

const RISK_INDEX_THRESHOLD = 120;

@Injectable()
export class TdfpmCalculatorService {
  /**
   * 从道路类型获取强度系数
   */
  getRoadIntensity(roadType?: string): number {
    if (!roadType) return 1.2;
    const lower = String(roadType).toLowerCase();
    for (const [keyword, intensity] of Object.entries(ROAD_INTENSITY_MAP)) {
      if (lower.includes(keyword)) return intensity;
    }
    return 1.2;
  }

  /**
   * 计算单日疲劳分数 (0-100)
   */
  computeFatigueScore(ctx: TdfpmDayContext): TdfpmResult {
    const intensity = this.getRoadIntensity(ctx.roadType);
    const drivingLoad = Math.min(ctx.drivingHours * intensity, 24 * intensity);

    const cognitiveLoad = Math.min(ctx.cognitiveLoad ?? 5, 20);
    const circadianPenalty = this.getCircadianPenalty(ctx.departureHour ?? 8);
    const weatherPenalty = Math.min(ctx.weatherPenalty ?? 0, 15);
    const altitudePenalty = ctx.altitudeM ? (ctx.altitudeM / 1000) * 5 : 0;

    const breakRecovery = (ctx.breakMinutes ?? 0) * 0.6 + (ctx.hasNap ? 15 : 0);
    const sleepRecovery = ctx.sleepHours != null ? (ctx.sleepHours / 8) * 20 : 20;

    const rawScore =
      drivingLoad + cognitiveLoad + circadianPenalty + weatherPenalty + altitudePenalty - breakRecovery - sleepRecovery;
    const fatigueScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    const riskLevel = this.scoreToRiskLevel(fatigueScore);
    const recommendation = this.scoreToRecommendation(fatigueScore, ctx.drivingHours);

    let confidence = 1.0;
    if (ctx.sleepHours == null) confidence *= 0.9;
    if (ctx.departureHour == null) confidence *= 0.95;

    return {
      fatigueScore,
      riskLevel,
      recommendation,
      drivingLoad: Math.round(drivingLoad * 10) / 10,
      confidence,
    };
  }

  /**
   * 计算 RiskIndex（用于强制停止决策）
   */
  computeRiskIndex(
    fatigueScore: number,
    options?: { weatherRisk?: number; nightFactor?: number; roadComplexity?: number }
  ): number {
    const w = options?.weatherRisk ?? 1.0;
    const n = options?.nightFactor ?? 1.0;
    const r = options?.roadComplexity ?? 1.0;
    return fatigueScore * w * n * r;
  }

  /**
   * 是否应强制建议停止驾驶
   */
  shouldRecommendStop(result: TdfpmResult, options?: { weatherRisk?: number; nightFactor?: number }): boolean {
    const riskIndex = this.computeRiskIndex(result.fatigueScore, {
      ...options,
      roadComplexity: 1.0,
    });
    return riskIndex > RISK_INDEX_THRESHOLD || result.fatigueScore >= 80;
  }

  private getCircadianPenalty(hour: number): number {
    if (hour >= 2 && hour < 6) return 25;
    if (hour >= 13 && hour < 15) return 15;
    if (hour >= 22 || hour < 2) return 10;
    return 0;
  }

  private scoreToRiskLevel(score: number): TdfpmRiskLevel {
    if (score < 30) return 'LOW';
    if (score < 60) return 'MODERATE';
    if (score < 80) return 'HIGH';
    return 'DANGEROUS';
  }

  private scoreToRecommendation(score: number, drivingHours: number): TdfpmRecommendation {
    if (score >= 80) return 'STOP_DRIVING';
    if (score >= 60) return 'REST_NOW';
    if (score >= 45 || drivingHours >= 6) return 'REST_SOON';
    if (drivingHours >= 8) return 'SPLIT_DAY';
    return 'OK';
  }
}
