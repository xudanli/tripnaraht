// src/route-directions/interfaces/route-judgment.interface.ts

/**
 * 路线存在性判断接口定义
 * 
 * 基于 ROUTE_STRUCTURE_THEORY_COMPLIANCE.md 的要求：
 * - 可行性判断（物理上能不能走）
 * - 适时性判断（当前状态下适不适合走）
 * - 匹配性判断（对这个用户合不合适）
 */

import { RouteDirectionData } from './route-direction.interface';

/**
 * 可行性等级
 */
export type FeasibilityLevel = '完全可行' | '有条件可行' | '困难' | '不可行';

/**
 * 适时性等级
 */
export type TimelinessLevel = '最佳时机' | '合适时机' | '可接受' | '不建议' | '警告';

/**
 * 匹配性等级
 */
export type MatchingLevel = '高度匹配' | '基本匹配' | '部分匹配' | '不匹配';

/**
 * 路线存在状态
 */
export type RouteExistenceStatus = 'EXISTS' | 'CONDITIONAL_EXISTS' | 'NOT_EXISTS';

/**
 * 地理可达性
 */
export interface Accessibility {
  /** 是否可达 */
  available: boolean;
  /** 说明 */
  explanation: string;
  /** 限制因素 */
  limitations?: string[];
}

/**
 * 时间可行性
 */
export interface TimeFeasibility {
  /** 是否可行 */
  feasible: boolean;
  /** 是否紧张 */
  tight: boolean;
  /** 说明 */
  explanation: string;
}

/**
 * 交通可用性
 */
export interface TransportAvailability {
  /** 是否可用 */
  available: boolean;
  /** 可用方式 */
  methods: string[];
  /** 说明 */
  explanation: string;
}

/**
 * 准入要求
 */
export interface AdmissionRequirements {
  /** 是否需要许可 */
  requiresPermit: boolean;
  /** 是否已获得许可 */
  permitObtained: boolean;
  /** 其他要求 */
  otherRequirements?: string[];
}

/**
 * 可行性判断
 */
export interface FeasibilityJudgment {
  /** 可行性等级 */
  level: FeasibilityLevel;
  /** 地理可达性 */
  accessibility: Accessibility;
  /** 时间可行性 */
  timeFeasibility: TimeFeasibility;
  /** 交通可用性 */
  transportAvailability: TransportAvailability;
  /** 准入要求 */
  admissionRequirements: AdmissionRequirements;
}

/**
 * 季节匹配
 */
export interface SeasonFit {
  /** 是否最佳 */
  best: boolean;
  /** 是否良好 */
  good: boolean;
  /** 是否可接受 */
  ok: boolean;
  /** 是否不好 */
  bad: boolean;
  /** 说明 */
  explanation: string;
}

/**
 * 天气匹配
 */
export interface WeatherFit {
  /** 是否良好 */
  good: boolean;
  /** 是否可接受 */
  ok: boolean;
  /** 是否有警告 */
  hasWarning: boolean;
  /** 说明 */
  explanation: string;
}

/**
 * 人流匹配
 */
export interface CrowdFit {
  /** 是否正常 */
  normal: boolean;
  /** 是否很高 */
  veryHigh: boolean;
  /** 说明 */
  explanation: string;
}

/**
 * 事件影响
 */
export interface EventImpact {
  /** 是否有影响 */
  hasImpact: boolean;
  /** 影响类型 */
  impactType?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  /** 说明 */
  explanation: string;
}

/**
 * 适时性判断
 */
export interface TimelinessJudgment {
  /** 适时性等级 */
  level: TimelinessLevel;
  /** 季节匹配 */
  seasonFit: SeasonFit;
  /** 天气匹配 */
  weatherFit: WeatherFit;
  /** 人流匹配 */
  crowdFit: CrowdFit;
  /** 事件影响 */
  eventImpact: EventImpact;
}

/**
 * 匹配评分
 */
export interface MatchScore {
  /** 评分（0-1） */
  score: number;
  /** 说明 */
  explanation: string;
}

/**
 * 匹配性判断
 */
export interface MatchingJudgment {
  /** 整体匹配等级 */
  overallMatch: MatchingLevel;
  /** 体力匹配 */
  physicalMatch: MatchScore;
  /** 经验匹配 */
  experienceMatch: MatchScore;
  /** 时间匹配 */
  timeMatch: MatchScore;
  /** 预算匹配 */
  budgetMatch: MatchScore;
  /** 偏好匹配 */
  preferenceMatch: MatchScore;
}

/**
 * 路线存在性判断结果
 */
export interface RouteExistenceJudgment {
  /** 可行性判断 */
  feasibility: FeasibilityJudgment;
  /** 适时性判断 */
  timeliness: TimelinessJudgment;
  /** 匹配性判断 */
  matching: MatchingJudgment;
  /** 存在性状态 */
  existence: {
    /** 状态 */
    status: RouteExistenceStatus;
    /** 原因 */
    reason: string;
    /** 证据 */
    evidence: string[];
    /** 评分（0-1） */
    score: number;
  };
  /** 解释 */
  explanation: string;
}

/**
 * 路线上下文
 */
export interface RouteContext {
  /** 当前日期 */
  currentDate: Date;
  /** 旅行日期 */
  travelDates?: {
    start: Date;
    end: Date;
  };
  /** 天气信息 */
  weather?: any;
  /** 人流信息 */
  crowd?: any;
  /** 交通信息 */
  transport?: any;
  /** 特殊事件 */
  events?: any[];
}

/**
 * 用户画像
 */
export interface UserProfile {
  /** 体力水平（1-10） */
  fitnessLevel?: number;
  /** 经验水平（1-10） */
  experienceLevel?: number;
  /** 可用时间（天数） */
  availableDays?: number;
  /** 预算 */
  budget?: number;
  /** 偏好 */
  preferences?: Record<string, any>;
  /** 风险容忍度 */
  riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
}
