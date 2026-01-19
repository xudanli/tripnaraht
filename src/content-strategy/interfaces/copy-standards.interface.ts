// src/content-strategy/interfaces/copy-standards.interface.ts

/**
 * 话术规范接口定义
 * 
 * 基于 IMPLEMENTATION_PLAN_P0.md 的要求：
 * - 推荐话术（基于匹配度，不包含"推荐指数"）
 * - 警告话术（风险话术，赋能用户）
 * - 拒绝话术（诚实说"不推荐"）
 * - 数据呈现话术
 */

import { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';

/**
 * 用户上下文
 */
export interface UserContext {
  /** 用户ID */
  userId?: string;
  /** 用户偏好 */
  preferences?: Record<string, any>;
  /** 用户画像 */
  profile?: Record<string, any>;
  /** 当前状态 */
  currentState?: Record<string, any>;
}

/**
 * 推荐话术
 */
export interface RecommendationCopy {
  /** 标题 */
  headline: string;
  /** 推荐理由 */
  reasons: string[];
  /** 需要考虑的因素 */
  considerations?: string[];
  /** 替代方案 */
  alternatives?: string[];
  /** 分析（不包含"推荐指数"） */
  analysis?: {
    matchingPoints: string[];
    potentialChallenges: string[];
    preparationNeeds: string[];
  };
}

/**
 * 风险类型
 */
export type RiskType = 'WEATHER' | 'PHYSICAL' | 'SAFETY' | 'LOGISTICS' | 'FINANCIAL' | 'OTHER';

/**
 * 技术风险
 */
export interface TechnicalRisk {
  /** 风险类型 */
  type: RiskType;
  /** 风险级别 */
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** 风险描述 */
  description: string;
  /** 风险详情 */
  details?: Record<string, any>;
}

/**
 * 风险话术
 */
export interface RiskCopy {
  /** 这是什么风险 */
  what: string;
  /** 为什么有这个风险 */
  why: string;
  /** 如何准备（赋能用户） */
  howToPrepare: string[];
  /** 赋能信息 */
  empowerment: string;
  /** 可能性分析 */
  possibilities?: string[];
}

/**
 * 拒绝原因类型
 */
export type RejectionReasonType =
  | 'SAFETY_RISK'
  | 'CAPABILITY_MISMATCH'
  | 'CONSTRAINT_VIOLATION'
  | 'TIMING_ISSUE'
  | 'BUDGET_MISMATCH'
  | 'OTHER';

/**
 * 拒绝原因
 */
export interface RejectionReason {
  /** 拒绝类型 */
  type: RejectionReasonType;
  /** 原因描述 */
  description: string;
  /** 详情 */
  details?: Record<string, any>;
}

/**
 * 拒绝话术
 */
export interface RejectionCopy {
  /** 标题（诚实说"不推荐"） */
  headline: string;
  /** 原因 */
  reason: string;
  /** 替代方案 */
  alternatives?: string[];
  /** 更好的计划建议 */
  betterPlan?: string;
  /** 解释（为什么不能推荐） */
  explanation?: string;
}

/**
 * 数据呈现话术
 */
export interface DataPresentationCopy {
  /** 数据标题 */
  title: string;
  /** 数据值 */
  value: string | number;
  /** 这意味着什么 */
  whatItMeans: string;
  /** 层级化呈现 */
  layers?: {
    level1: string; // 结论
    level2: string; // 原因
    level3: string; // 依据
  };
  /** 数据来源 */
  source?: string;
  /** 置信度 */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}
