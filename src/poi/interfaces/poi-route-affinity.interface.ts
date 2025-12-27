// src/poi/interfaces/poi-route-affinity.interface.ts
/**
 * POI 路线亲和度接口定义
 * 
 * P2.2: POI 的路线亲和度
 * 
 * 定义POI与路线方向的匹配度评分和解释
 */

import { RouteDirectionData, SignaturePois, ObjectiveWeights } from '../../route-directions/interfaces/route-direction.interface';

/**
 * POI 路线亲和度评分结果
 */
export interface POIRouteAffinity {
  /** POI ID */
  poiId: string;
  /** 路线方向ID */
  routeDirectionId: number;
  /** 总亲和度分数（0-100） */
  affinityScore: number;
  /** 分数分解 */
  scoreBreakdown: AffinityScoreBreakdown;
  /** 匹配原因 */
  matchReasons: string[];
  /** 不匹配原因 */
  mismatchReasons?: string[];
}

/**
 * 亲和度分数分解
 */
export interface AffinityScoreBreakdown {
  /** 标签匹配分数（0-100） */
  tagMatch: {
    score: number;
    weight: number;
    matchedTags: string[];
    totalRouteTags: number;
  };
  /** 类型匹配分数（0-100） */
  typeMatch: {
    score: number;
    weight: number;
    poiType?: string;
    isSignatureType: boolean;
    typeWeight?: number; // 来自signaturePois.weights
  };
  /** 地理位置匹配分数（0-100） */
  locationMatch: {
    score: number;
    weight: number;
    inRegion: boolean;
    inCorridor: boolean;
    distanceToCorridorKm?: number;
  };
  /** 目标权重匹配分数（0-100） */
  objectiveMatch: {
    score: number;
    weight: number;
    matchedObjectives: string[];
    objectiveWeights?: ObjectiveWeights;
  };
  /** 示例POI加分（0-100） */
  exampleBonus: {
    score: number;
    weight: number;
    isExample: boolean;
  };
  /** 季节性匹配分数（0-100） */
  seasonalityMatch: {
    score: number;
    weight: number;
    currentMonth?: number;
    isBestMonth: boolean;
    isAvoidMonth: boolean;
  };
}

/**
 * POI 路线亲和度计算选项
 */
export interface POIAffinityCalculationOptions {
  /** 当前月份（1-12），用于季节性匹配 */
  currentMonth?: number;
  /** 是否考虑地理位置匹配 */
  considerLocation?: boolean;
  /** 是否考虑季节性匹配 */
  considerSeasonality?: boolean;
  /** 自定义权重（覆盖默认权重） */
  customWeights?: {
    tagMatch?: number;
    typeMatch?: number;
    locationMatch?: number;
    objectiveMatch?: number;
    exampleBonus?: number;
    seasonalityMatch?: number;
  };
}

/**
 * POI 基本信息（用于亲和度计算）
 */
export interface POIInfo {
  /** POI ID */
  id: string;
  /** POI 名称 */
  name?: string;
  /** POI 标签 */
  tags?: string[];
  /** POI 类型（canonicalType） */
  type?: string;
  /** POI 分类 */
  category?: string;
  /** POI 位置 */
  location?: {
    lat: number;
    lng: number;
    regionKey?: string;
  };
  /** POI 元数据 */
  metadata?: Record<string, any>;
}

