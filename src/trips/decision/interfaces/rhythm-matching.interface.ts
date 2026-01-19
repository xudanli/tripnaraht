// src/trips/decision/interfaces/rhythm-matching.interface.ts

/**
 * 节奏匹配接口定义
 * 
 * 基于 ROUTE_STRUCTURE_THEORY_COMPLIANCE.md 和 DECISION_MODELING_COMPLIANCE.md 的要求：
 * - 五种节奏类型（紧凑型、舒缓型、弹性型、主题型、混合型）
 * - 路线节奏特性提取
 * - 用户节奏容量提取
 * - 动态节奏调整
 */

import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UserPersona } from '../../../agent/memory/interfaces/multi-persona.interface';
import { PersonaChangeSignals } from '../../../agent/memory/interfaces/multi-persona.interface';

/**
 * 节奏类型
 */
export type RhythmType = 'INTENSIVE' | 'RELAXED' | 'FLEXIBLE' | 'THEMED' | 'HYBRID';

/**
 * 路线节奏特性
 */
export interface RouteRhythmProfile {
  /** 物理强度（0-1） */
  physicalIntensity: number;
  /** 心理负荷（0-1） */
  mentalLoad: number;
  /** 信息密度（0-1） */
  informationDensity: number;
  /** 决策频率（0-1） */
  decisionFrequency: number;
  /** 环境刺激（0-1） */
  environmentalStimulation: number;
  /** 每日平均步数 */
  averageDailySteps: number;
  /** 每日平均POI数 */
  averageDailyPois: number;
  /** 每日平均休息时间（小时） */
  averageDailyRestTime: number;
  /** 节奏变化度（0-1） */
  rhythmVariation: number;
}

/**
 * 用户节奏容量
 */
export interface UserRhythmCapacity {
  /** 物理容量（0-1） */
  physicalCapacity: number;
  /** 注意力容量（0-1） */
  attentionCapacity: number;
  /** 情绪容量（0-1） */
  emotionalCapacity: number;
  /** 每日可用时间（小时） */
  dailyAvailableTime: number;
  /** 偏好节奏类型 */
  preferredRhythmType?: RhythmType;
  /** 节奏灵活性 */
  rhythmFlexibility: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * 节奏匹配分数
 */
export interface RhythmMatchScores {
  /** 物理匹配度（0-1） */
  physicalMatch: number;
  /** 注意力匹配度（0-1） */
  attentionMatch: number;
  /** 情绪匹配度（0-1） */
  emotionalMatch: number;
  /** 时间匹配度（0-1） */
  timeMatch: number;
  /** 整体匹配度（0-1） */
  overallMatch: number;
}

/**
 * 节奏匹配结果
 */
export interface RhythmMatchResult {
  /** 匹配分数 */
  scores: RhythmMatchScores;
  /** 推荐的节奏类型 */
  recommendedRhythm: RhythmType;
  /** 推荐理由 */
  recommendationReason: string;
  /** 调整建议 */
  adjustments: RhythmAdjustment[];
  /** 替代节奏类型 */
  alternativeRhythms: Array<{
    type: RhythmType;
    score: number;
    reason: string;
  }>;
}

/**
 * 节奏调整
 */
export interface RhythmAdjustment {
  /** 调整类型 */
  type: 'REDUCE_INTENSITY' | 'INCREASE_REST' | 'REDUCE_POIS' | 'ADJUST_SCHEDULE' | 'OTHER';
  /** 调整描述 */
  description: string;
  /** 优先级 */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 具体建议 */
  suggestions: string[];
}

/**
 * 节奏类型定义
 */
export interface RhythmTypeDefinition {
  /** 节奏类型 */
  type: RhythmType;
  /** 每日步数范围 */
  dailySteps: { min: number; max: number };
  /** POI数量范围 */
  poiCount: { min: number; max: number };
  /** 休息时间范围（小时） */
  restTime: { min: number; max: number };
  /** 适合的用户 */
  suitableFor: string[];
  /** 警告 */
  warnings: string[];
  /** 典型日程 */
  typicalSchedule: string;
}

/**
 * 旅行进度
 */
export interface TravelProgress {
  /** 当前天数 */
  currentDay: number;
  /** 总天数 */
  totalDays: number;
  /** 已完成活动 */
  completedActivities: number;
  /** 剩余活动 */
  remainingActivities: number;
  /** 当前疲劳度 */
  currentFatigue: number;
  /** 当前满意度 */
  currentSatisfaction: number;
}

/**
 * 节奏调整结果
 */
export interface RhythmAdjustmentResult {
  /** 是否需要调整 */
  needsAdjustment: boolean;
  /** 调整类型 */
  adjustmentType?: 'GRADUAL' | 'IMMEDIATE' | 'PREVENTIVE';
  /** 调整建议 */
  adjustments: RhythmAdjustment[];
  /** 调整原因 */
  reasons: string[];
  /** 预期效果 */
  expectedEffects: string[];
}
