// src/agent/memory/interfaces/user-travel-profile.interface.ts

/**
 * L1: 用户旅行人格（UserTravelProfile）
 *
 * 记住用户是谁，跨年生命周期，作为决策基线
 * 参考：docs/CONTEXT_ORCHESTRATOR_IMPLEMENTATION_PLAN.md 2.2
 */

export type PacePreference = 'SLOW' | 'MODERATE' | 'FAST';
export type AltitudeTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type TravelPhilosophy = 'SCENIC' | 'ADVENTURE' | 'RELAXED';
export type RouteType = 'HIKING' | 'ROAD_TRIP' | 'SEA' | 'URBAN' | 'CULTURAL' | 'NATURE';
export type EmotionalState = 'exploring' | 'decided' | 'anxious' | 'neutral';

/** 同行人信息 */
export interface CompanionsInfo {
  count: number;
  mobility?: string;  // 行动能力描述，如 "正常" "轮椅" "老人"
  ageRange?: string;  // 如 "成人" "带小孩" "家庭"
}

/** 设备信息 */
export interface DeviceInfo {
  platform: string;       // 如 "iOS" "Android" "Web"
  offlineCapable?: boolean;
}

/** 时间窗口约束 */
export interface TimeWindowConstraint {
  start: string;   // ISO 8601 日期或时间
  end: string;
  flexible?: boolean;  // 是否可灵活调整
}

/**
 * 驾驶疲劳偏好（用于驾驶时间安全评估，2-15-8 法则）
 * 存于 extendedProfile，供 API / 运营配置，暂不对普通用户开放表单
 */
export interface DrivingFatiguePreferences {
  /** 行程中典型睡眠：adequate(7-9h)=1.0, short(6-7h)=0.85, poor(5-6h)=0.7, very_poor(<5h)=0.5 */
  sleepQuality?: 'adequate' | 'short' | 'poor' | 'very_poor';
  /** 休息习惯：regular(每2h休15min)=1.0, sometimes=0.9, rarely=0.7, none=0.7 */
  breakHabit?: 'regular' | 'sometimes' | 'rarely' | 'none';
  /** 心理压力：low(熟悉)=1.0, medium=0.9, high(陌生/赶时间)=0.8 */
  stressLevel?: 'low' | 'medium' | 'high';
}

export interface UserTravelProfile {
  userId: string;

  pacePreference?: PacePreference;
  altitudeTolerance?: AltitudeTolerance;
  riskTolerance?: RiskTolerance;
  travelPhilosophy?: TravelPhilosophy;
  preferredRouteTypes?: RouteType[];

  /** 同行人信息 */
  companions?: CompanionsInfo;
  /** 设备信息 */
  deviceInfo?: DeviceInfo;
  /** 时间约束 */
  timeWindow?: TimeWindowConstraint;
  /** 情绪状态（可选，用于上下文适配） */
  emotionalState?: EmotionalState;
  /** 驾驶疲劳偏好（可选，存于 extendedProfile，用于驾驶安全评估） */
  drivingFatiguePreferences?: DrivingFatiguePreferences;

  confidence: number; // 0~1，学习置信度
  source: 'explicit' | 'inferred' | 'mixed'; // 来源

  updatedAt: Date;
}

/**
 * 默认用户画像（用于新用户）
 */
export function createDefaultUserTravelProfile(userId: string): UserTravelProfile {
  return {
    userId,
    pacePreference: 'MODERATE',
    altitudeTolerance: 'MEDIUM',
    riskTolerance: 'MEDIUM',
    travelPhilosophy: 'SCENIC',
    preferredRouteTypes: [],
    confidence: 0.3, // 新用户置信度较低
    source: 'inferred',
    updatedAt: new Date(),
  };
}


