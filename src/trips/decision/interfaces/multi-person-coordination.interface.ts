// src/trips/decision/interfaces/multi-person-coordination.interface.ts

/**
 * 多人旅行协调接口定义
 * 
 * 基于 DECISION_MODELING_COMPLIANCE.md 的要求：
 * - 理解每个人的需求
 * - 分析冲突与共识
 * - 提供协调方案
 * - 支持群体决策讨论
 */

import { TravelerInfo, InterestProfile, MobilityProfile } from '../../interfaces/pacing-config.interface';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UserPersona } from '../../../agent/memory/interfaces/multi-persona.interface';
import { RhythmType } from './rhythm-matching.interface';

/**
 * 个人偏好分析
 */
export interface IndividualPreference {
  /** 旅行者ID或标识 */
  travelerId: string;
  /** 旅行者信息 */
  travelerInfo: TravelerInfo;
  /** 用户人格（如果可用） */
  persona?: UserPersona;
  /** 节奏偏好 */
  rhythmPreference?: RhythmType;
  /** 风险容忍度 */
  riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 兴趣偏好 */
  interests?: string[];
  /** 必须访问的地点 */
  mustPlaces?: string[];
  /** 避免的地点 */
  avoidPlaces?: string[];
  /** 预算偏好 */
  budgetPreference?: 'BUDGET' | 'MODERATE' | 'LUXURY';
  /** 时间偏好 */
  timePreference?: 'EARLY_BIRD' | 'NORMAL' | 'NIGHT_OWL';
}

/**
 * 冲突类型
 */
export type ConflictType = 
  | 'RHYTHM_MISMATCH'      // 节奏不匹配
  | 'RISK_TOLERANCE_GAP'   // 风险容忍度差异
  | 'INTEREST_DIVERGENCE'   // 兴趣分歧
  | 'BUDGET_CONFLICT'       // 预算冲突
  | 'TIME_PREFERENCE_GAP'   // 时间偏好差异
  | 'PHYSICAL_CAPACITY_GAP' // 体能差异
  | 'MUST_PLACE_CONFLICT';  // 必去地点冲突

/**
 * 冲突详情
 */
export interface Conflict {
  /** 冲突ID */
  id: string;
  /** 冲突类型 */
  type: ConflictType;
  /** 严重程度 */
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 涉及的旅行者ID */
  involvedTravelers: string[];
  /** 冲突描述 */
  description: string;
  /** 冲突原因 */
  reason: string;
  /** 影响范围 */
  impact: string[];
}

/**
 * 共识点
 */
export interface Consensus {
  /** 共识ID */
  id: string;
  /** 共识类型 */
  type: 'RHYTHM' | 'INTEREST' | 'BUDGET' | 'TIME' | 'RISK' | 'OTHER';
  /** 涉及的旅行者ID */
  involvedTravelers: string[];
  /** 共识描述 */
  description: string;
  /** 共识强度（0-1） */
  strength: number;
}

/**
 * 协调方案类型
 */
export type CoordinationStrategy = 
  | 'SEGMENTED_RHYTHM'      // 分段不同节奏
  | 'OVERALL_RELAXED_WITH_UPGRADE' // 整体舒缓有升级选项
  | 'SPLIT_ACTIVITIES'      // 分开活动
  | 'COMPROMISE_MIDDLE'     // 折中方案
  | 'ROTATING_PRIORITY'     // 轮流优先
  | 'INDEPENDENT_TIME';     // 独立时间

/**
 * 协调方案
 */
export interface CoordinationOption {
  /** 方案ID */
  id: string;
  /** 协调策略 */
  strategy: CoordinationStrategy;
  /** 方案描述 */
  description: string;
  /** 具体实施建议 */
  implementation: string[];
  /** 解决的冲突 */
  resolvedConflicts: string[];
  /** 优点 */
  advantages: string[];
  /** 缺点 */
  disadvantages: string[];
  /** 适用性评分（0-1） */
  suitabilityScore: number;
  /** 预期满意度（每个旅行者） */
  expectedSatisfaction: Record<string, number>;
}

/**
 * 个人匹配分析
 */
export interface IndividualFitAnalysis {
  /** 旅行者ID */
  travelerId: string;
  /** 与路线的匹配度（0-1） */
  overallMatch: number;
  /** 节奏匹配度 */
  rhythmMatch: number;
  /** 兴趣匹配度 */
  interestMatch: number;
  /** 风险匹配度 */
  riskMatch: number;
  /** 体能匹配度 */
  physicalMatch: number;
  /** 匹配点 */
  matchPoints: string[];
  /** 不匹配点 */
  mismatchPoints: string[];
  /** 建议 */
  suggestions: string[];
}

/**
 * 讨论话题
 */
export interface DiscussionTopic {
  /** 话题ID */
  id: string;
  /** 话题标题 */
  title: string;
  /** 话题描述 */
  description: string;
  /** 相关冲突 */
  relatedConflicts: string[];
  /** 讨论要点 */
  discussionPoints: string[];
  /** 建议问题 */
  suggestedQuestions: string[];
}

/**
 * 协调结果
 */
export interface CoordinationResult {
  /** 个人分析 */
  individualAnalysis: IndividualFitAnalysis[];
  /** 冲突区域 */
  conflictAreas: Conflict[];
  /** 共识点 */
  consensus: Consensus[];
  /** 协调方案选项 */
  optionsForCoordination: CoordinationOption[];
  /** 建议讨论话题 */
  suggestedDiscussionPoints: DiscussionTopic[];
  /** 总体建议 */
  overallRecommendation: string;
}

/**
 * 路线计划草案
 */
export interface RoutePlanDraft {
  /** 路线数据 */
  route: RouteDirectionData;
  /** 建议节奏 */
  suggestedRhythm?: RhythmType;
  /** 预计天数 */
  estimatedDays?: number;
  /** 预计预算 */
  estimatedBudget?: number;
}
