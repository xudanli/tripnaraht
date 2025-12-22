// src/trips/readiness/types/capability-pack.types.ts

/**
 * Capability Pack Types - 国家能力包类型定义
 * 
 * 定义可复用的地理/环境能力包，基于地理特征和 POI 数据自动触发
 * 这些 Pack 可以应用到任何国家/地区，无需硬编码
 */

import { Condition, Action, RuleSeverity, ReadinessCategory } from './readiness-pack.types';
import { TripContext } from './trip-context.types';

/**
 * 能力包类型
 */
export type CapabilityPackType =
  | 'high_altitude'      // 高海拔
  | 'sparse_supply'      // 补给稀疏
  | 'seasonal_road'      // 季节性封路/山口
  | 'permit_checkpoint'  // 许可/检查站
  | 'emergency';         // 应急

/**
 * 能力包配置
 */
export interface CapabilityPackConfig {
  /** 能力包类型 */
  type: CapabilityPackType;
  /** 显示名称 */
  displayName: string;
  /** 触发条件（基于地理特征和上下文） */
  trigger: CapabilityTrigger;
  /** 规则列表 */
  rules: CapabilityRule[];
  /** 风险提示 */
  hazards?: CapabilityHazard[];
  /** 元数据 */
  metadata?: {
    description?: string;
    applicableRegions?: string[]; // ISO country codes
    priority?: number; // 优先级（数字越小优先级越高）
  };
}

/**
 * 能力包触发条件
 */
export interface CapabilityTrigger {
  /** 必须满足的所有条件 */
  all?: CapabilityCondition[];
  /** 满足任一条件即可 */
  any?: CapabilityCondition[];
  /** 取反条件 */
  not?: CapabilityCondition;
}

/**
 * 能力包条件（基于地理特征）
 */
export interface CapabilityCondition {
  /** 地理特征路径（如 "geo.mountains.mountainElevationAvg"） */
  geoPath?: string;
  /** 比较操作符 */
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'in' | 'exists' | 'containsAny';
  /** 比较值 */
  value?: any;
  /** 上下文路径（如 "itinerary.season"） */
  contextPath?: string;
  /** 嵌套条件 */
  all?: CapabilityCondition[];
  any?: CapabilityCondition[];
  not?: CapabilityCondition;
}

/**
 * 能力包规则
 */
export interface CapabilityRule {
  id: string;
  category: ReadinessCategory;
  severity: RuleSeverity;
  /** 规则适用条件 */
  appliesTo?: {
    seasons?: string[];
    activities?: string[];
    travelerTags?: string[];
  };
  /** 触发条件（细化条件，在 Pack 触发后进一步判断） */
  when: CapabilityCondition;
  /** 动作 */
  then: Action;
  /** 证据/来源 */
  evidence?: Array<{
    sourceId: string;
    sectionId?: string;
    quote?: string;
  }>;
  /** 备注 */
  notes?: string;
}

/**
 * 能力包风险
 */
export interface CapabilityHazard {
  type: string;
  severity: RuleSeverity;
  summary: string;
  mitigations: string[];
}

/**
 * 高海拔能力包配置
 */
export interface HighAltitudePackConfig extends CapabilityPackConfig {
  type: 'high_altitude';
  trigger: {
    all?: Array<{
      geoPath: 'geo.mountains.mountainElevationAvg';
      operator: 'gte';
      value: number; // 默认 2500 或 3000
    } | {
      contextPath: 'itinerary.countries';
      operator: 'in';
      value: string[]; // 高原国家列表（如 ['BT', 'NP', 'PE']）
    }>;
  };
}

/**
 * 补给稀疏能力包配置
 */
export interface SparseSupplyPackConfig extends CapabilityPackConfig {
  type: 'sparse_supply';
  trigger: {
    all?: Array<{
      geoPath: 'geo.roads.roadDensityScore';
      operator: 'lt';
      value: number; // 道路密度阈值
    } | {
      geoPath: 'geo.pois.supplyDensity';
      operator: 'lt';
      value: number; // 补给点密度阈值
    } | {
      contextPath: 'itinerary.routeLength';
      operator: 'gt';
      value: number; // 路线长度阈值（km）
    }>;
  };
}

/**
 * 季节性封路能力包配置
 */
export interface SeasonalRoadPackConfig extends CapabilityPackConfig {
  type: 'seasonal_road';
  trigger: {
    all?: Array<{
      geoPath: 'geo.mountains.inMountain';
      operator: 'eq';
      value: true;
    } | {
      contextPath: 'itinerary.season';
      operator: 'in';
      value: string[]; // 冬季月份或季节
    } | {
      geoPath: 'geo.roads.hasMountainPass';
      operator: 'eq';
      value: true;
    }>;
  };
}

/**
 * 许可/检查站能力包配置
 */
export interface PermitCheckpointPackConfig extends CapabilityPackConfig {
  type: 'permit_checkpoint';
  trigger: {
    any?: Array<{
      geoPath: 'geo.pois.hasCheckpoint';
      operator: 'eq';
      value: true;
    } | {
      contextPath: 'itinerary.countries';
      operator: 'in';
      value: string[]; // 需要许可的国家列表
    } | {
      contextPath: 'itinerary.activities';
      operator: 'containsAny';
      value: string[]; // 需要许可的活动（如 'border_crossing', 'restricted_area'）
    }>;
  };
}

/**
 * 应急能力包配置
 */
export interface EmergencyPackConfig extends CapabilityPackConfig {
  type: 'emergency';
  // trigger 使用通用的 CapabilityTrigger 类型，支持嵌套条件
  trigger: CapabilityTrigger;
}

/**
 * 能力包评估结果
 */
export interface CapabilityPackResult {
  packType: CapabilityPackType;
  triggered: boolean;
  rules: Array<{
    id: string;
    triggered: boolean;
    level: string;
    message: string;
  }>;
  hazards: Array<{
    type: string;
    severity: string;
    summary: string;
  }>;
}

