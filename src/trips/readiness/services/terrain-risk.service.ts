// src/trips/readiness/services/terrain-risk.service.ts

/**
 * Terrain Risk Service
 * 
 * 评估地形风险并生成风险标志
 */

import { Injectable } from '@nestjs/common';
import { TerrainFacts, RiskFlag } from '../types/terrain-facts.types';
import { DEFAULT_TERRAIN_POLICY } from '../config/terrain-policy.config';

@Injectable()
export class TerrainRiskService {
  /**
   * 评估地形风险并生成风险标志
   */
  evaluateRisks(terrainFacts: TerrainFacts): TerrainFacts['riskFlags'] {
    const flags: TerrainFacts['riskFlags'] = [];
    const stats = terrainFacts.terrainStats;
    const thresholds = DEFAULT_TERRAIN_POLICY.riskThresholds;

    // 1. 高海拔风险
    if (stats.maxElevationM >= thresholds.highAltitudeM) {
      flags.push({
        type: 'HIGH_ALTITUDE',
        severity: this.calculateSeverity(stats.maxElevationM, thresholds.highAltitudeM, 5000),
        message: `最高海拔 ${stats.maxElevationM}m，超过高海拔阈值 ${thresholds.highAltitudeM}m`,
      });
    }

    // 2. 快速上升风险
    if (stats.totalAscentM >= thresholds.rapidAscentM) {
      flags.push({
        type: 'RAPID_ASCENT',
        severity: this.calculateSeverity(stats.totalAscentM, thresholds.rapidAscentM, 1000),
        message: `累计爬升 ${stats.totalAscentM}m，超过快速上升阈值 ${thresholds.rapidAscentM}m`,
      });
    }

    // 3. 陡坡风险
    if (stats.maxSlopePct >= thresholds.steepSlopePct) {
      flags.push({
        type: 'STEEP_SLOPE',
        severity: this.calculateSeverity(stats.maxSlopePct, thresholds.steepSlopePct, 25),
        message: `最大坡度 ${stats.maxSlopePct}%，超过陡坡阈值 ${thresholds.steepSlopePct}%`,
      });
    }

    // 4. 大爬升日风险（需要结合天数信息，这里简化处理）
    if (stats.totalAscentM >= thresholds.bigAscentDayM) {
      flags.push({
        type: 'BIG_ASCENT_DAY',
        severity: this.calculateSeverity(stats.totalAscentM, thresholds.bigAscentDayM, 2500),
        message: `累计爬升 ${stats.totalAscentM}m，超过大爬升日阈值 ${thresholds.bigAscentDayM}m`,
      });
    }

    return flags;
  }

  /**
   * 计算风险严重程度
   */
  private calculateSeverity(
    value: number,
    threshold: number,
    highThreshold: number
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (value >= highThreshold) {
      return 'HIGH';
    } else if (value >= threshold * 1.5) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }
}

