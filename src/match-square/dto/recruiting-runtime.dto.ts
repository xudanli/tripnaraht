// Recruiting Runtime DTOs
// 招募运行时数据传输对象

import { IsEnum, IsOptional, IsNumber, IsString, IsArray, IsBoolean, Min, Max } from 'class-validator';
import { RecruitingDecisionReason, RecruitingSignal, AttributionConfidence } from '../types/recruiting-runtime.types';

/**
 * 审核申请请求
 */
export class ReviewApplicationRequest {
  @IsString()
  applicationId!: string;

  @IsEnum(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  compatibilityScore?: number;

  @IsOptional()
  @IsEnum(['high', 'medium', 'low'])
  mbtiCompatibility?: 'high' | 'medium' | 'low';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicantSkills?: string[];

  @IsOptional()
  @IsBoolean()
  scheduleConflict?: boolean;

  @IsOptional()
  @IsEnum(['excellent', 'good', 'poor'])
  timeAvailability?: 'excellent' | 'good' | 'poor';

  @IsOptional()
  @IsEnum(['perfect', 'acceptable', 'poor'])
  budgetFit?: 'perfect' | 'acceptable' | 'poor';

  @IsOptional()
  @IsString()
  captainPreference?: string;

  @IsOptional()
  @IsString()
  slotRequirement?: string;

  @IsOptional()
  teamBalance?: {
    genderBalance?: number;
    ageBalance?: number;
    roleBalance?: number;
  };

  @IsOptional()
  @IsBoolean()
  pastCollaboration?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  governanceFlags?: string[];
}

/**
 * 招募归因响应
 */
export class RecruitingAttributionResponse {
  causeType!: string;
  primaryReason!: RecruitingDecisionReason;
  reasonCodes!: string[];
  signalScores!: Record<RecruitingSignal, number>;
  confidence!: AttributionConfidence;
  metadata?: {
    ruleId?: string;
    alternativeReasons?: RecruitingDecisionReason[];
    compatibilityScore?: number;
    skillMatchScore?: number;
    scheduleMatchScore?: number;
    budgetMatchScore?: number;
  };
  alternatives!: RecruitingAttributionResponse[];
  timestamp!: Date;
}

/**
 * 招募结果响应
 */
export class RecruitingOutcomeResponse {
  id!: string;
  postId!: string;
  tripId?: string;
  successLevel!: string;
  metrics!: {
    timeToFill: number;
    applicationCount: number;
    approvedCount: number;
    rejectedCount: number;
    conversionRate: number;
    matchSuccessRate: number;
    teamPerformance: number;
    attritionRate: number;
  };
  factors!: Array<{
    type: string;
    impact: number;
    description: string;
    details?: Record<string, any>;
  }>;
  recommendations!: string[];
  computedAt!: Date;
  dataQuality!: number;
  confidence!: number;
}

/**
 * 招募洞察响应
 */
export class RecruitingInsightsResponse {
  postId!: string;
  attributionSummary!: {
    primaryReasons: Record<string, number>;
    signalDistribution: Record<string, number>;
    confidenceDistribution: Record<string, number>;
  };
  outcomeSummary?: RecruitingOutcomeResponse;
  recommendations!: string[];
}

/**
 * 招募优化响应
 */
export class RecruitingOptimizationResponse {
  type!: 'compatibility' | 'exposure' | 'diversity' | 'screening' | 'communication';
  priority!: 'high' | 'medium' | 'low';
  description!: string;
  actionItems!: string[];
  expectedImpact!: string;
}
