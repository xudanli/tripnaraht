// src/trips/decision/shared/world-model.types.ts
/**
 * Core Types for Decision Strategy
 * 
 * 统一的世界模型类型定义
 * 
 * 第一性原理架构：三段式结构
 * - physical: 物理现实（地形、路网、Hazard）
 * - human: 人体能力（爬升、坡度、适应度）
 * - routeDirection: 路线哲学（不可背叛的规则）
 */

import { PhysicalRealityModel } from '../models/physical-reality.model';
import { HumanCapabilityModel } from '../models/human-capability.model';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { RoutePhilosophy } from '../models/route-philosophy.model';

/**
 * DEM 决策证据
 * 
 * 注意：这个接口用于 WorldModelContext，与 DemDecisionEvidenceService 返回的接口略有不同
 * 为了兼容，我们使用与 DemDecisionEvidenceService 一致的字段名
 */
export interface DemDecisionEvidence {
  segmentId: string;
  elevationProfile: number[];  // meters
  cumulativeAscent: number;  // 与 DemDecisionEvidenceService 保持一致
  maxSlopePct: number;
  rollingAscent3Days: number;  // 与 DemDecisionEvidenceService 保持一致
  fatigueIndex: number;  // 与 DemDecisionEvidenceService 保持一致
  violation: 'HARD' | 'SOFT' | 'NONE';
  explanation: string;  // 与 DemDecisionEvidenceService 保持一致
  metadata?: {
    consecutiveHighAltitudeDays?: number;
    avgSlopePct?: number;
    distanceM?: number;
    elevationRange?: {
      min: number;
      max: number;
    };
    [key: string]: any;
  };
}

/**
 * 天气证据
 */
export interface WeatherEvidence {
  segmentId: string;
  windSpeedMs: number;
  visibilityM: number;
  precipitationMm: number;
  violation: 'HARD' | 'SOFT' | 'NONE';
}

/**
 * 合规证据
 */
export interface ComplianceEvidence {
  requiresPermit: boolean;
  requiresGuide: boolean;
  valid: boolean;
  violation: 'HARD' | 'SOFT' | 'NONE';
}

/**
 * 决策参数（从 HumanCapabilityModel 投影出来）
 * 
 * @deprecated 建议直接使用 HumanCapabilityModel，这个接口保留用于向后兼容
 */
export interface DecisionParams {
  maxDailyAscentM: number;
  rollingAscent3DaysM: number;
  maxSlopePct: number;
  weatherRiskWeight: number;
  bufferDayBias: 'LOW' | 'MEDIUM' | 'HIGH';
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * 路线方向（带哲学模型）
 */
export interface RouteDirectionWithPhilosophy extends RouteDirectionData {
  philosophy?: RoutePhilosophy | string;
}

/**
 * 世界模型上下文（三段式结构）
 * 
 * 第一性原理要求：
 * - physical: 地球那一坨（地形、路网、Hazard）
 * - human: 人那一坨（能力、偏好、适应度）
 * - routeDirection: 世界观那一坨（路线哲学、不可背叛的规则）
 */
export interface WorldModelContext {
  /** 物理现实模型（必须） */
  physical: PhysicalRealityModel;

  /** 人体能力模型（必须） */
  human: HumanCapabilityModel;

  /** 路线方向（带哲学模型，必须） */
  routeDirection: RouteDirectionWithPhilosophy;

  /** 合规证据（可选，用于 Abu 检查） */
  complianceEvidence?: ComplianceEvidence[];
}

/**
 * 向后兼容的旧版 WorldModelContext（用于迁移期）
 * 
 * @deprecated 使用新的三段式结构
 */
export interface LegacyWorldModelContext {
  countryCode: string;
  month: number;
  decisionParams: DecisionParams;
  demEvidence: DemDecisionEvidence[];
  weatherEvidence?: WeatherEvidence[];
  complianceEvidence?: ComplianceEvidence[];
}

/**
 * 路线段
 */
export interface RouteSegment {
  segmentId: string;
  dayIndex: number;
  distanceKm: number;
  ascentM: number;
  slopePct: number;
  metadata?: Record<string, any>;
}

/**
 * 路线计划草案
 */
export interface RoutePlanDraft {
  tripId: string;
  routeDirectionId: string;
  segments: RouteSegment[];
}

