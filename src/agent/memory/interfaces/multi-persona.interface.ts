// src/agent/memory/interfaces/multi-persona.interface.ts

/**
 * 多人格用户画像接口定义
 * 
 * 基于 DECISION_MODELING_COMPLIANCE.md 和 DATA_MODELING_COMPLIANCE.md 的要求：
 * - 支持多persona（工作日旅行人格、假期旅行人格等）
 * - 人格识别算法
 * - 人格动态变化机制
 */

import {
  PacePreference,
  AltitudeTolerance,
  RiskTolerance,
  TravelPhilosophy,
  RouteType,
} from './user-travel-profile.interface';

/**
 * 物理状态
 */
export interface PhysicalState {
  /** 体力水平（1-10） */
  fitnessLevel: number;
  /** 疲劳程度（0-1） */
  fatigueLevel: number;
  /** 健康状况 */
  healthStatus: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  /** 适应状态 */
  adaptationStatus?: 'ADAPTED' | 'ADAPTING' | 'NOT_ADAPTED';
}

/**
 * 心理状态
 */
export interface PsychologicalState {
  /** 压力水平（0-1） */
  stressLevel: number;
  /** 兴奋程度（0-1） */
  excitementLevel: number;
  /** 信心度（0-1） */
  confidenceLevel: number;
  /** 情绪状态 */
  mood: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}

/**
 * 时间状态
 */
export interface TimeState {
  /** 可用时间（天数） */
  availableDays: number;
  /** 时间紧迫度（0-1） */
  timePressure: number;
  /** 时间灵活性 */
  timeFlexibility: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 时间段 */
  timeOfDay?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
  /** 旅行阶段 */
  tripStage?: 'PLANNING' | 'PREPARATION' | 'TRAVELING' | 'REFLECTION';
}

/**
 * 偏好状态
 */
export interface PreferenceState {
  /** 节奏偏好 */
  pacePreference?: PacePreference;
  /** 海拔耐受度 */
  altitudeTolerance?: AltitudeTolerance;
  /** 风险容忍度 */
  riskTolerance?: RiskTolerance;
  /** 旅行哲学 */
  travelPhilosophy?: TravelPhilosophy;
  /** 偏好路线类型 */
  preferredRouteTypes?: RouteType[];
  /** 兴趣列表 */
  interests?: string[];
  /** 预算偏好 */
  budgetPreference?: 'BUDGET' | 'MODERATE' | 'LUXURY';
  /** 时间偏好 */
  timePreference?: 'EARLY_BIRD' | 'NORMAL' | 'NIGHT_OWL';
  /** 其他偏好 */
  otherPreferences?: Record<string, any>;
}

/**
 * 用户活动记录
 */
export interface UserActivityRecord {
  /** 活动时间 */
  timestamp: Date;
  /** 活动类型 */
  activityType: string;
  /** 活动详情 */
  details: Record<string, any>;
}

/**
 * 用户人格
 */
export interface UserPersona {
  /** 人格名称 */
  personaName: string; // "工作日旅行人格"、"假期旅行人格"、"冒险旅行人格"等
  /** 旅行类型 */
  tripType: string;
  /** 当前状态 */
  currentState: {
    /** 物理状态 */
    physical: PhysicalState;
    /** 心理状态 */
    psychological: PsychologicalState;
    /** 时间状态 */
    temporal: TimeState;
  };
  /** 偏好状态 */
  preferences: PreferenceState;
  /** 活动历史 */
  activityHistory: UserActivityRecord[];
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  updatedAt: Date;
  /** 使用次数 */
  usageCount: number;
  /** 置信度（0-1） */
  confidence: number;
}

/**
 * 人格上下文
 */
export interface PersonaContext {
  /** 环境因素 */
  environment?: {
    location?: string;
    weather?: string;
    season?: string;
  };
  /** 社交因素 */
  social?: {
    travelCompanions?: number;
    groupSize?: number;
    socialPreference?: 'SOLO' | 'SMALL_GROUP' | 'LARGE_GROUP';
  };
  /** 情境因素 */
  situation?: {
    tripPurpose?: string;
    specialOccasion?: string;
    constraints?: string[];
  };
}

/**
 * 人格变化信号
 */
export interface PersonaChangeSignals {
  /** 物理变化信号 */
  physical?: Partial<PhysicalState>;
  /** 心理变化信号 */
  psychological?: Partial<PsychologicalState>;
  /** 时间变化信号 */
  temporal?: Partial<TimeState>;
  /** 偏好变化信号 */
  preferences?: Partial<PreferenceState>;
  /** 环境变化 */
  environment?: PersonaContext['environment'];
  /** 社交变化 */
  social?: PersonaContext['social'];
}

/**
 * 人格变化结果
 */
export interface PersonaChangeResult {
  /** 是否发生变化 */
  hasChanged: boolean;
  /** 变化类型 */
  changeType?: 'GRADUAL' | 'ABRUPT' | 'TEMPORARY';
  /** 变化幅度（0-1） */
  changeMagnitude?: number;
  /** 变化原因 */
  changeReasons: string[];
  /** 新人格（如果有） */
  newPersona?: UserPersona;
}

/**
 * 扩展的用户旅行画像（支持多persona）
 */
export interface MultiPersonaUserTravelProfile {
  /** 用户ID */
  userId: string;
  /** 多个persona */
  personas: UserPersona[];
  /** 当前激活的persona */
  currentPersona?: string;
  /** 基础画像（向后兼容） */
  baseProfile: {
    pacePreference?: PacePreference;
    altitudeTolerance?: AltitudeTolerance;
    riskTolerance?: RiskTolerance;
    travelPhilosophy?: TravelPhilosophy;
    preferredRouteTypes?: RouteType[];
  };
  /** 整体置信度 */
  confidence: number;
  /** 来源 */
  source: 'explicit' | 'inferred' | 'mixed';
  /** 更新时间 */
  updatedAt: Date;
}
