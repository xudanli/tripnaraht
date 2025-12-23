// src/trips/readiness/config/terrain-policy.config.ts

/**
 * Terrain Policy 配置
 * 
 * 可配置的阈值和权重，用于地形风险评估和决策
 */

import { EffortLevel } from '../types/terrain-facts.types';

export interface RiskThresholds {
  /** 高海拔阈值（米） */
  highAltitudeM: number;
  /** 快速上升阈值（米/天） */
  rapidAscentM: number;
  /** 陡坡阈值（百分比） */
  steepSlopePct: number;
  /** 大爬升日阈值（米/天） */
  bigAscentDayM: number;
}

export interface EffortLevelMapping {
  relaxMax: number;
  moderateMax: number;
  challengeMax: number;
  extremeMin: number;
}

export interface DecisionWeights {
  /** 海拔惩罚权重 */
  altitudePenalty: number;
  /** 爬升惩罚权重 */
  ascentPenalty: number;
  /** 坡度惩罚权重 */
  slopePenalty: number;
  /** 快速上升惩罚权重 */
  rapidAscentPenalty: number;
}

export interface TerrainConstraints {
  /** 第一天高海拔限制（米） */
  firstDayMaxElevationM: number;
  /** 最大日爬升限制（米） */
  maxDailyAscentM: number;
  /** 连续高爬升天数限制 */
  maxConsecutiveHighAscentDays: number;
  /** 高海拔日缓冲时间（小时） */
  highAltitudeBufferHours: number;
}

export interface TerrainActions {
  /** 是否允许降级强度 */
  allowIntensityDowngrade: boolean;
  /** 是否允许拆分天数 */
  allowDaySplit: boolean;
  /** 是否允许替换陡坡段 */
  allowSteepSegmentReplacement: boolean;
  /** 是否允许插入休息日 */
  allowRestDayInsertion: boolean;
}

export const DEFAULT_TERRAIN_POLICY = {
  riskThresholds: {
    highAltitudeM: 3500,
    rapidAscentM: 500,
    steepSlopePct: 15,
    bigAscentDayM: 1500,
  } as RiskThresholds,
  
  effortLevelMapping: {
    relaxMax: 30,
    moderateMax: 60,
    challengeMax: 85,
    extremeMin: 85,
  } as EffortLevelMapping,
  
  decisionWeights: {
    altitudePenalty: 1.0,
    ascentPenalty: 1.5,
    slopePenalty: 2.0,
    rapidAscentPenalty: 3.0,
  } as DecisionWeights,
  
  terrainConstraints: {
    firstDayMaxElevationM: 3000,
    maxDailyAscentM: 1000,
    maxConsecutiveHighAscentDays: 2,
    highAltitudeBufferHours: 2,
  } as TerrainConstraints,
  
  terrainActions: {
    allowIntensityDowngrade: true,
    allowDaySplit: true,
    allowSteepSegmentReplacement: true,
    allowRestDayInsertion: true,
  } as TerrainActions,
};

