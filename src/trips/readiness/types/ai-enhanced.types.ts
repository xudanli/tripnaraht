// src/trips/readiness/types/ai-enhanced.types.ts

/**
 * AI Enhanced Types
 * 
 * 定义 AI 增强功能的类型
 */

import { ReadinessCheckResult, ReadinessFindingItem } from './readiness-findings.types';

/**
 * 用户画像
 */
export interface UserProfile {
  userId?: string;
  nationality?: string;
  residencyCountry?: string;
  tags?: string[];
  budgetLevel?: 'low' | 'medium' | 'high';
  riskTolerance?: 'low' | 'medium' | 'high';
}

/**
 * 截止日期增强
 */
export interface DeadlineEnhancement {
  itemId: string;
  deadline: string; // ISO date
  evidence: string[];
  confidence: number; // 0-1
}

/**
 * 办理渠道增强
 */
export interface ChannelEnhancement {
  itemId: string;
  channels: Array<{
    name: string;
    url?: string;
    description?: string;
  }>;
  evidence: string[];
  confidence: number; // 0-1
}

/**
 * 优先级排序增强
 */
export interface RankingEnhancement {
  itemId: string;
  personalizedRank: number;
  reasoning: string;
  evidence: string[];
  confidence: number; // 0-1
}

/**
 * 推荐原因增强
 */
export interface ReasonEnhancement {
  itemId: string;
  reason: string;
  evidence: string[];
  confidence: number; // 0-1
}

/**
 * AI 增强结果
 */
export interface AIEnhancements {
  deadlines?: DeadlineEnhancement[];
  channels?: ChannelEnhancement[];
  rankings?: RankingEnhancement[];
  reasons?: ReasonEnhancement[];
}

/**
 * AI 增强的准备度结果
 */
export interface AIEnhancedReadinessResult extends ReadinessCheckResult {
  aiEnhancements?: AIEnhancements;
  failedFeatures?: string[]; // 失败的 AI 增强功能列表
}

/**
 * 风险严重程度评估增强
 */
export interface RiskSeverityEnhancement {
  riskId: string;
  originalSeverity: 'high' | 'medium' | 'low';
  assessedSeverity: 'high' | 'medium' | 'low';
  reasoning: string;
  confidence: number; // 0-1
}

/**
 * 应对措施增强
 */
export interface MitigationEnhancement {
  riskId: string;
  personalizedMitigations: string[];
  evidence: string[];
  confidence: number; // 0-1
}

/**
 * 紧急联系方式增强
 */
export interface EmergencyContactEnhancement {
  riskId: string;
  contacts: Array<{
    type: string;
    name: string;
    phone?: string;
    email?: string;
    url?: string;
  }>;
  evidence: string[];
  confidence: number; // 0-1
}

/**
 * 风险预警 AI 增强
 */
export interface RiskAIEnhancements {
  severityAssessments?: RiskSeverityEnhancement[];
  mitigations?: MitigationEnhancement[];
  emergencyContacts?: EmergencyContactEnhancement[];
}

/**
 * 打包清单物品增强
 */
export interface PackingItemEnhancement {
  itemId: string;
  recommendedQuantity?: number;
  reason?: string;
  evidence?: string[];
  confidence?: number; // 0-1
}

/**
 * 打包清单 AI 增强
 */
export interface PackingListAIEnhancements {
  itemEnhancements?: PackingItemEnhancement[];
}

/**
 * 修复方案增强
 */
export interface SolutionEnhancement {
  solutionId: string;
  title: string;
  description: string;
  cost?: {
    amount?: number;
    currency?: string;
    estimate?: string; // 'low' | 'medium' | 'high'
  };
  timeRequired?: {
    days?: number;
    estimate?: string; // 'low' | 'medium' | 'high'
  };
  feasibility: number; // 0-1
  reasoning: string;
  evidence: string[];
}

/**
 * 修复方案 AI 增强
 */
export interface SolutionAIEnhancements {
  solutions?: SolutionEnhancement[];
}
