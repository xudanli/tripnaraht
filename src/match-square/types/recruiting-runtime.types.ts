// Recruiting Runtime Types
// 招募运行时类型定义

import { DecisionCauseType, AttributionConfidence } from '../../trips/attribution/types/decision-attribution.types';

export { AttributionConfidence };
import { TripSuccessLevel } from '../../trips/outcome/types/travel-outcome.types';

/**
 * 招募决策原因类型
 */
export enum RecruitingDecisionReason {
  COMPATIBILITY_MATCH = 'COMPATIBILITY_MATCH',
  SKILL_REQUIREMENT = 'SKILL_REQUIREMENT',
  SCHEDULE_ALIGNMENT = 'SCHEDULE_ALIGNMENT',
  BUDGET_ALIGNMENT = 'BUDGET_ALIGNMENT',
  PERSONA_FIT = 'PERSONA_FIT',
  CAPTAIN_PREFERENCE = 'CAPTAIN_PREFERENCE',
  SLOT_REQUIREMENT = 'SLOT_REQUIREMENT',
  TEAM_BALANCE = 'TEAM_BALANCE',
  EXTERNAL_FACTOR = 'EXTERNAL_FACTOR',
  GOVERNANCE = 'GOVERNANCE',
  REPUTATION_SCORE = 'REPUTATION_SCORE',
  PAST_COLLABORATION = 'PAST_COLLABORATION',
}

/**
 * 招募影响信号
 */
export enum RecruitingSignal {
  MBTI_COMPATIBILITY = 'MBTI_COMPATIBILITY',
  INTERACTION_MODE = 'INTERACTION_MODE',
  SKILL_MATCH = 'SKILL_MATCH',
  TIME_AVAILABILITY = 'TIME_AVAILABILITY',
  BUDGET_FIT = 'BUDGET_FIT',
  EXPERIENCE_LEVEL = 'EXPERIENCE_LEVEL',
  REPUTATION_SCORE = 'REPUTATION_SCORE',
  PAST_COLLABORATION = 'PAST_COLLABORATION',
  GENDER_BALANCE = 'GENDER_BALANCE',
  AGE_BALANCE = 'AGE_BALANCE',
  ROLE_BALANCE = 'ROLE_BALANCE',
}

/**
 * 招募决策归因
 */
export interface RecruitingAttribution {
  causeType: DecisionCauseType;
  primaryReason: RecruitingDecisionReason;
  reasonCodes: string[];
  signalScores: Record<RecruitingSignal, number>;
  confidence: AttributionConfidence;
  metadata?: {
    ruleId?: string;
    alternativeReasons?: RecruitingDecisionReason[];
    compatibilityScore?: number;
    skillMatchScore?: number;
    scheduleMatchScore?: number;
    budgetMatchScore?: number;
  };
}

/**
 * 招募归因结果
 */
export interface RecruitingAttributionResult {
  attribution: RecruitingAttribution;
  alternatives: RecruitingAttribution[];
  timestamp: Date;
}

/**
 * 招募归因请求
 */
export interface RecruitingAttributionRequest {
  eventType: string;
  payload: {
    applicationId?: string;
    postId?: string;
    decision?: 'approved' | 'rejected';
    captainUserId?: string;
    applicantUserId?: string;
    compatibilityScore?: number;
    mbtiCompatibility?: 'high' | 'medium' | 'low';
    requiredSkills?: string[];
    applicantSkills?: string[];
    scheduleConflict?: boolean;
    timeAvailability?: 'excellent' | 'good' | 'poor';
    budgetFit?: 'perfect' | 'acceptable' | 'poor';
    captainPreference?: string;
    slotRequirement?: string;
    teamBalance?: {
      genderBalance?: number;
      ageBalance?: number;
      roleBalance?: number;
    };
    pastCollaboration?: boolean;
    governanceFlags?: string[];
  };
  context?: RecruitingAttributionContext;
}

/**
 * 招募归因上下文
 */
export interface RecruitingAttributionContext {
  post?: {
    captainMbtiType?: string;
    captainInteractionMode?: string;
    planningStyle?: string;
    slotsNeeded: number;
    budgetMinCents?: number;
    budgetMaxCents?: number;
  };
  applicant?: {
    mbtiType?: string;
    cardTitle?: string;
    interactionMode?: string;
    skills?: string[];
    experienceLevel?: 'beginner' | 'intermediate' | 'expert';
  };
  existingTeam?: {
    memberCount: number;
    genderDistribution?: Record<string, number>;
    ageRange?: { min: number; max: number };
    roles?: string[];
  };
}

/**
 * 招募成功等级
 */
export enum RecruitmentSuccessLevel {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  ACCEPTABLE = 'ACCEPTABLE',
  POOR = 'POOR',
  FAILED = 'FAILED',
}

/**
 * 招募结果指标
 */
export interface RecruitingMetrics {
  timeToFill: number; // days
  applicationCount: number;
  approvedCount: number;
  rejectedCount: number;
  conversionRate: number; // approved / application
  matchSuccessRate: number; // team formed / approved
  teamPerformance: number; // based on Trip Outcome
  attritionRate: number; // members who left / total
}

/**
 * 招募结果因素
 */
export enum RecruitingFactorType {
  COMPATIBILITY_ACCURACY = 'COMPATIBILITY_ACCURACY',
  SLOT_FILL_RATE = 'SLOT_FILL_RATE',
  TEAM_DIVERSITY = 'TEAM_DIVERSITY',
  COMMUNICATION_QUALITY = 'COMMUNICATION_QUALITY',
  CONFLICT_RATE = 'CONFLICT_RATE',
  SATISFACTION_SCORE = 'SATISFACTION_SCORE',
}

/**
 * 招募结果因素
 */
export interface RecruitingFactor {
  type: RecruitingFactorType;
  impact: number; // 0-1
  description: string;
  details?: Record<string, any>;
}

/**
 * 招募结果
 */
export interface RecruitingOutcome {
  id: string;
  postId: string;
  tripId?: string;
  successLevel: RecruitmentSuccessLevel;
  metrics: RecruitingMetrics;
  factors: RecruitingFactor[];
  recommendations: string[];
  computedAt: Date;
  dataQuality: number; // 0-1
  confidence: number; // 0-1
}

/**
 * 招募结果计算请求
 */
export interface RecruitingOutcomeRequest {
  postId: string;
  tripId?: string;
  tripOutcome?: {
    successLevel: TripSuccessLevel;
    overallScore: number;
    companionSatisfaction: string;
    companionMatchScore: number;
  };
  applications?: Array<{
    id: string;
    status: string;
    decidedAt?: Date;
    attribution?: any;
  }>;
  post?: {
    slotsNeeded: number;
    publishedAt?: Date;
    closedAt?: Date;
  };
}

/**
 * 招募结果计算结果
 */
export interface RecruitingOutcomeResult {
  outcome: RecruitingOutcome;
  timestamp: Date;
}

/**
 * 招募洞察
 */
export interface RecruitingInsights {
  postId: string;
  attributionSummary: {
    primaryReasons: Record<RecruitingDecisionReason, number>;
    signalDistribution: Record<RecruitingSignal, number>;
    confidenceDistribution: Record<AttributionConfidence, number>;
  };
  outcomeSummary?: RecruitingOutcome;
  recommendations: string[];
}

/**
 * 招募优化策略
 */
export interface RecruitingOptimization {
  type: 'compatibility' | 'exposure' | 'diversity' | 'screening' | 'communication';
  priority: 'high' | 'medium' | 'low';
  description: string;
  actionItems: string[];
  expectedImpact: string;
}

/**
 * 招募运行时上下文
 */
export interface RecruitingRuntimeContext {
  postId: string;
  tripId?: string;
  captainUserId: string;
  applicants: string[];
  teamMembers?: string[];
}
