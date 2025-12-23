// src/trips/readiness/types/terrain-facts.types.ts

/**
 * Terrain Facts 类型定义
 * 
 * 标准化的地形事实数据结构，用于决策引擎
 */

export type EffortLevel = 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME';

export type RiskFlag = 
  | 'HIGH_ALTITUDE'      // 高海拔（>3500m）
  | 'RAPID_ASCENT'       // 快速上升（>500m/天）
  | 'STEEP_SLOPE'        // 陡坡（>15%）
  | 'BIG_ASCENT_DAY';    // 大爬升日（>1500m/天）

export interface TerrainStats {
  /** 最低海拔（米） */
  minElevationM: number;
  /** 最高海拔（米） */
  maxElevationM: number;
  /** 累计爬升（米） */
  totalAscentM: number;
  /** 累计下降（米） */
  totalDescentM: number;
  /** 最大坡度（百分比） */
  maxSlopePct: number;
  /** 平均坡度（百分比） */
  avgSlopePct: number;
  /** 体力消耗评分（0-100） */
  effortScore: number;
  /** 总距离（米） */
  totalDistanceM: number;
}

export interface TerrainFacts {
  /** 地形统计信息 */
  terrainStats: TerrainStats;
  /** 体力等级 */
  effortLevel: EffortLevel;
  /** 风险标志数组 */
  riskFlags: Array<{
    type: RiskFlag;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
  }>;
  /** 海拔剖面ID（用于缓存） */
  elevationProfileId: string;
  /** 数据源 */
  source: 'CN_DEM' | 'GLOBAL_DEM';
  /** 计算时间 */
  computedAt: string;
}

export type RouteSegmentId = string;

export interface TerrainFactsWithId {
  segmentId: RouteSegmentId;
  terrainFacts: TerrainFacts;
}

