// src/content-strategy/interfaces/content-quality.interface.ts

/**
 * 内容类型
 */
export type ContentType = 
  | 'RECOMMENDATION'    // 推荐
  | 'WARNING'           // 警告
  | 'REJECTION'         // 拒绝
  | 'EXPLANATION'       // 解释
  | 'INFORMATION'       // 信息
  | 'QUESTION'          // 问题
  | 'CONFIRMATION';     // 确认

/**
 * 检查结果状态
 */
export type CheckStatus = 'PASS' | 'WARNING' | 'FAIL';

/**
 * 理性性检查结果
 */
export interface RationalityCheckResult {
  status: CheckStatus;
  score: number;  // 0-1，理性性得分
  checks: {
    hasDataSources: {
      passed: boolean;
      message: string;
      dataSources?: string[];
    };
    hasRecommendationReasons: {
      passed: boolean;
      message: string;
      reasons?: string[];
    };
    considersMultipleAngles: {
      passed: boolean;
      message: string;
      angles?: string[];
    };
    noContradictions: {
      passed: boolean;
      message: string;
      contradictions?: string[];
    };
  };
  overallMessage: string;
  suggestions: string[];
}

/**
 * 温度检查结果
 */
export interface WarmthCheckResult {
  status: CheckStatus;
  score: number;  // 0-1，温度得分
  checks: {
    hasUnderstanding: {
      passed: boolean;
      message: string;
      evidence?: string[];
    };
    noCommanding: {
      passed: boolean;
      message: string;
      commandingPhrases?: string[];
    };
    respectsAutonomy: {
      passed: boolean;
      message: string;
      autonomyRespects?: string[];
    };
    hasHumanDetails: {
      passed: boolean;
      message: string;
      humanDetails?: string[];
    };
  };
  overallMessage: string;
  suggestions: string[];
}

/**
 * 可执行性检查结果
 */
export interface ExecutabilityCheckResult {
  status: CheckStatus;
  score: number;  // 0-1，可执行性得分
  checks: {
    isDirectlyUsable: {
      passed: boolean;
      message: string;
      issues?: string[];
    };
    noAbstractExpressions: {
      passed: boolean;
      message: string;
      abstractExpressions?: string[];
    };
    userCanUnderstand: {
      passed: boolean;
      message: string;
      unclearParts?: string[];
    };
    systemCanExecute: {
      passed: boolean;
      message: string;
      executionIssues?: string[];
    };
  };
  overallMessage: string;
  suggestions: string[];
}

/**
 * 伦理检查结果
 */
export interface EthicsCheckResult {
  status: CheckStatus;
  score: number;  // 0-1，伦理得分
  checks: {
    noSalesHiddenInfo: {
      passed: boolean;
      message: string;
      hiddenInfo?: string[];
    };
    noOverRiskRendering: {
      passed: boolean;
      message: string;
      overRiskPhrases?: string[];
    };
    safetyFirst: {
      passed: boolean;
      message: string;
      safetyConcerns?: string[];
    };
    userDecisionPower: {
      passed: boolean;
      message: string;
      decisionPowerIssues?: string[];
    };
  };
  overallMessage: string;
  suggestions: string[];
}

/**
 * 内容质量检查结果（综合）
 */
export interface ContentQualityCheckResult {
  contentType: ContentType;
  content: string;
  rationality: RationalityCheckResult;
  warmth: WarmthCheckResult;
  executability: ExecutabilityCheckResult;
  ethics: EthicsCheckResult;
  overallScore: number;  // 0-1，综合得分
  overallStatus: CheckStatus;
  passed: boolean;  // 是否通过所有检查
  criticalIssues: string[];  // 关键问题
  recommendations: string[];  // 改进建议
}

/**
 * 内容质量检查配置
 */
export interface ContentQualityCheckConfig {
  strictMode?: boolean;  // 严格模式，默认false
  minRationalityScore?: number;  // 最小理性性得分，默认0.6
  minWarmthScore?: number;  // 最小温度得分，默认0.5
  minExecutabilityScore?: number;  // 最小可执行性得分，默认0.7
  minEthicsScore?: number;  // 最小伦理得分，默认0.8
  requireAllChecks?: boolean;  // 是否要求所有检查都通过，默认false
}

/**
 * 内容上下文（用于检查）
 */
export interface ContentContext {
  contentType: ContentType;
  content: string;
  metadata?: {
    dataSources?: string[];
    recommendationReasons?: string[];
    userProfile?: {
      persona?: string;
      experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
      riskTolerance?: 'low' | 'medium' | 'high';
    };
    relatedContent?: string[];
    decisionContext?: {
      hasAlternatives?: boolean;
      isCriticalDecision?: boolean;
      requiresUserConfirmation?: boolean;
    };
  };
}
