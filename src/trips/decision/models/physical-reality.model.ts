// src/trips/decision/models/physical-reality.model.ts
/**
 * Physical Reality Model（物理现实模型）
 * 
 * 第一性原理：地形、路网、自然障碍、Hazard、季节性
 * 
 * 约束：没有 PhysicalRealityModel，就不允许生成"可执行计划"
 */

import { DemDecisionEvidence } from '../interfaces/dem-decision-evidence.interface';

/**
 * 道路状态
 */
export interface RoadState {
  roadId: string;
  status: 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';
  seasonOpenFrom?: number; // Month (1-12)
  seasonOpenTo?: number;   // Month (1-12)
  requires4x4?: boolean;
  requiresPermit?: boolean;
  segmentId?: string; // Link to route segment
  metadata?: Record<string, any>;
}

/**
 * 危险区域状态
 */
export interface HazardZoneState {
  zoneId: string;
  type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
  level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  seasonality?: {
    highRiskMonths: number[]; // 高风险月份
    lowRiskMonths: number[];
  };
  segmentId?: string;
  geom?: any; // PostGIS geometry
  metadata?: Record<string, any>;
}

/**
 * 渡轮状态
 */
export interface FerryState {
  ferryId: string;
  routeId: string;
  status: 'RUNNING' | 'CANCELLED' | 'SEASONAL';
  seasonOpenFrom?: number; // Month (1-12)
  seasonOpenTo?: number;   // Month (1-12)
  lastStatusUpdate?: Date;
  metadata?: Record<string, any>;
}

/**
 * 实况天气决策证据（WeatherDecisionEvidenceService → 物理层 SSOT）
 *
 * 与 `weather-decision-evidence.interface` 对齐，供策略层消费。
 */
export interface WeatherObservationEvidence {
  segmentId: string;
  /** ISO 日期（计划日） */
  date?: string;
  windSpeedMs: number;
  windGustMs?: number;
  windDirectionDeg?: number;
  /** 能见度（米）；缺失表示数据源未提供 */
  visibilityM?: number;
  precipitationMm: number;
  violation: 'HARD' | 'SOFT' | 'NONE';
  crosswindRisk?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  explanation?: string;
  metadata?: Record<string, any>;
}

/**
 * 气候季节性
 */
export interface ClimateSeasonality {
  countryCode: string;
  month: number;
  accessibilityScore: number; // 0-1, 可达性评分
  typicalWeather?: {
    windSpeedMps: number;
    precipitationMmPerHour: number;
    visibilityMeters: number;
    temperatureCelsius: number;
  };
  riskFactors?: string[]; // e.g., ["high_wind", "snow"]
  metadata?: Record<string, any>;
}

/**
 * 物理现实模型
 * 
 * 对应第一性原理：
 * - 地形（DEM、高程、坡度）
 * - 路网（road/ferry/rail）
 * - 自然障碍（河流、山脉、海岸线）
 * - Hazard（雪崩、泥石流、高风险区）
 * - 季节性 & 封路状态
 */
export interface PhysicalRealityModel {
  /** DEM 决策证据（必须） */
  demEvidence: DemDecisionEvidence[];

  /** 道路状态（F-road 开/关、季节性） */
  roadStates: RoadState[];

  /** 危险区域状态（雪崩带等） */
  hazardZones: HazardZoneState[];

  /** 渡轮状态 */
  ferryStates: FerryState[];

  /**
   * 实况天气决策证据（按 plan 日维度；与 DEM 路段证据互补）
   */
  /**
   * 原始观测条带（可审计、可持久化）。**执行语义**以引擎 `executionSemanticView` 为准，决策模块勿单独解释此数组。
   */
  weatherEvidence?: WeatherObservationEvidence[];

  /**
   * 民用晨光/暮光可行性摘要（与 `ExternalSignalsState.daylightFeasibility` 同源，供 Neptune 时间域 SOFT）
   */
  daylightFeasibilitySignal?: import('../temporal/temporal-propagation.types').DaylightFeasibilitySignalSummary;

  /** 气候季节性（月份→可达性评分） */
  climateSeasonality?: ClimateSeasonality;

  /** 国家代码 */
  countryCode: string;

  /** 月份 */
  month: number;

  /**
   * Temporal constraints overlay (auto-heal / emergency injection).
   * Keyed by poi_id or segment_id depending on caller context.
   */
  temporalConstraints?: {
    hard_deadlines?: Record<string, string>;
    reason_code?: string;
  };

  /**
   * Warm-start evidence injected from Prefetcher/EvidenceCache.
   * These are raw evidence objects (e.g. weather_physics / road_state / public_transit) with cached_at/expires_at
   * so downstream fact derivation can remain deterministic and auditable.
   */
  prefetched_evidence?: Array<Record<string, any>>;
}

/**
 * 验证物理现实模型是否完整
 */
export function validatePhysicalRealityModel(model: PhysicalRealityModel): {
  valid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  // 参数验证
  if (!model) {
    return {
      valid: false,
      missingFields: ['model'],
    };
  }

  if (!model.demEvidence || model.demEvidence.length === 0) {
    missingFields.push('demEvidence');
  }

  if (!model.roadStates) {
    missingFields.push('roadStates');
  }

  if (!model.hazardZones) {
    missingFields.push('hazardZones');
  }

  if (!model.ferryStates) {
    missingFields.push('ferryStates');
  }

  if (!model.countryCode) {
    missingFields.push('countryCode');
  }

  if (!model.month || model.month < 1 || model.month > 12) {
    missingFields.push('month');
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

