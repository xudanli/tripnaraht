// src/planning-policy/interfaces/planning-policy.interface.ts

import {
  InterestProfile,
  MobilityProfile,
} from '../../trips/interfaces/pacing-config.interface';
import { TransitSegment } from './transit-segment.interface';

// 重新导出，方便使用
export { InterestProfile, MobilityProfile } from '../../trips/interfaces/pacing-config.interface';

/**
 * 旅行类型
 */
export type TripType = 'BUSINESS' | 'LEISURE' | 'FAMILY' | 'BACKPACKING';

/**
 * 预算敏感度
 */
export type BudgetSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 时间敏感度
 */
export type TimeSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 风险容忍度
 */
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 计划稳定性偏好
 */
export type PlanStabilityPreference = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 旅行者DTO（用于画像编译）
 */
export interface TravelerDto {
  /** 兴趣维度 */
  type: InterestProfile;
  /** 体能维度 */
  mobilityTag: MobilityProfile;
  /** 权重（用于兴趣融合，默认 1.0） */
  weight?: number;
}

/**
 * 用户上下文（扩展版本）
 */
export interface UserContext {
  // 场景特征
  hasLuggage: boolean;
  hasElderly: boolean;
  isRaining: boolean;
  hasLimitedMobility: boolean;
  isMovingDay: boolean;

  // 敏感度
  budgetSensitivity: BudgetSensitivity;
  timeSensitivity: TimeSensitivity;

  // 地理信息
  currentCity?: string;
  targetCity?: string;

  // 新增字段（工程上必须）
  riskTolerance?: RiskTolerance;
  planStabilityPreference?: PlanStabilityPreference;
}

/**
 * 节奏配置（Pacing Config）
 * 
 * 木桶效应后的团队节奏/限制
 */
export interface PacingConfig {
  /** HP上限（木桶效应后的团队HP上限） */
  hpMax: number;
  /** 回血倍率（休息时恢复的HP百分比） */
  regenRate: number;
  /** 步行速度系数（越大越慢） */
  walkSpeedMultiplier: number;
  /** 爬楼惩罚（ACTIVE_SENIOR/LIMITED 可能是 9999） */
  stairPenalty: number;
  /** 强制休息间隔（分钟） */
  forcedRestIntervalMin: number;
  /** 地形规则 */
  terrainRules: {
    /** 禁止楼梯 */
    forbidStairs: boolean;
    /** 仅轮椅通道 */
    wheelchairOnly: boolean;
    /** 单段连续步行上限（分钟） */
    maxContinuousWalkMin: number;
    /** 每日步行上限（分钟） */
    maxDailyWalkMin: number;
  };
}

/**
 * 硬约束（Hard Constraints）
 * 
 * 必须满足的条件，否则不可行
 */
export interface HardConstraints {
  /** 必须轮椅可达 */
  requireWheelchairAccess: boolean;
  /** 禁止楼梯 */
  forbidStairs: boolean;
  /** 最大换乘次数 */
  maxTransfers: number;
  /** 单段步行分钟上限 */
  maxSingleWalkMin: number;
  /** 每日总步行分钟上限 */
  maxTotalWalkMinPerDay: number;
  /** 必须每隔X分钟有洗手间（多用于老人/儿童） */
  mustHaveRestroomEveryMin: number;
}

/**
 * 软权重（Soft Weights）
 * 
 * 打分权重，越高越偏好
 */
export interface SoftWeights {
  // 推荐/排序侧
  /** POI标签权重，如 { museum: 1.2, playground: 1.5 } */
  tagAffinity: Record<string, number>;
  /** 同类过多惩罚 */
  diversityPenalty: number;
  /** 必去景点加成 */
  mustSeeBoost: number;

  // 路径/排程侧
  /** 时间价值（元/分钟），用于时间-金钱 tradeoff */
  valueOfTimePerMin: number;
  /** 步行痛苦（每分钟） */
  walkPainPerMin: number;
  /** 每次换乘惩罚 */
  transferPain: number;
  /** 每段楼梯惩罚 */
  stairPain: number;
  /** 拥挤/排队惩罚（每分钟） */
  crowdPainPerMin: number;
  /** 下雨时步行痛苦倍数 */
  rainWalkMultiplier: number;
  /** 行李场景公共交通惩罚 */
  luggageTransitPenalty: number;
  /** 有老人时换乘惩罚倍数 */
  elderlyTransferMultiplier: number;
  /** 动态重排改动惩罚（稳定性偏好） */
  planChangePenalty: number;
  /** 超时惩罚（每分钟，蒙特卡洛/排程） */
  overtimePenaltyPerMin: number;
}

/**
 * 边代价输入（用于计算单段路径代价）
 */
export interface EdgeCostInput {
  /** 交通段 */
  segment: TransitSegment;
  /** 规划策略 */
  policy: PlanningPolicy;
}

/**
 * 行程代价输入（用于计算整体行程代价）
 */
export interface ItineraryCostInput {
  /** 总旅行时间（分钟） */
  totalTravelMin: number;
  /** 总步行时间（分钟） */
  totalWalkMin: number;
  /** 总换乘次数 */
  totalTransfers: number;
  /** 总排队时间（分钟） */
  totalQueueMin: number;
  /** 总楼梯段数 */
  totalStairsCount: number;
  /** 超时时间（分钟） */
  overtimeMin: number;
  /** 计划变更次数（动态重排用） */
  planChangeCount?: number;
}

/**
 * 代价模型（Cost Model）
 * 
 * 统一代价函数：所有算法复用
 */
export interface CostModel {
  /**
   * 计算边的代价（单段路径）
   */
  edgeCost(input: EdgeCostInput): number;

  /**
   * 计算行程的代价（整体行程）
   */
  itineraryCost(input: ItineraryCostInput, policy: PlanningPolicy): number;
}

/**
 * 规划策略（Planning Policy）
 * 
 * 画像编译器输出，后面召回/排序/路径/GA/蒙特卡洛/PPO 全吃它
 */
export interface PlanningPolicy {
  /** 节奏配置 */
  pacing: PacingConfig;
  /** 硬约束 */
  constraints: HardConstraints;
  /** 软权重 */
  weights: SoftWeights;
  /** 用户上下文 */
  context: UserContext;
  /** 派生信息（解释/审计用） */
  derived: {
    /** 团队兴趣混合（加权融合结果） */
    groupInterestMix: Record<InterestProfile, number>;
    /** 团队最弱体能（木桶效应结果） */
    groupMobilityWorst: MobilityProfile;
  };
}
