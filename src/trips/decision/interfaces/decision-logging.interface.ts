// src/trips/decision/interfaces/decision-logging.interface.ts

/**
 * 决策日志记录接口定义
 * 
 * 基于 IMPLEMENTATION_PLAN_P0.md 的要求：
 * - 记录决策点（可用选项、用户选择、系统建议）
 * - 记录决策结果（预期结果、实际结果、偏差、用户满意度）
 */

/**
 * 决策点类型
 */
export type DecisionPointType =
  | 'ROUTE_SELECTION'
  | 'RHYTHM_SELECTION'
  | 'RISK_ACKNOWLEDGMENT'
  | 'FINAL_CONFIRMATION';

/**
 * 决策选项
 */
export interface DecisionOption {
  /** 选项ID */
  optionId: string;
  /** 选项名称 */
  name: string;
  /** 选项描述 */
  description?: string;
  /** 选项特征 */
  characteristics?: Record<string, any>;
  /** 匹配度分析 */
  matchingAnalysis?: Record<string, any>;
  /** 风险评估 */
  riskAssessment?: Record<string, any>;
  /** 不确定性信息 */
  uncertainty?: Record<string, any>;
}

/**
 * 用户选择
 */
export interface UserChoice {
  /** 选择的选项ID */
  optionId: string;
  /** 选择时间 */
  selectionTime: Date;
  /** 用户给出的理由 */
  reasoning?: string;
  /** 用户的信心度（0-1） */
  confidenceLevel?: number;
}

/**
 * 系统分析
 */
export interface SystemAnalysis {
  /** 系统推荐（如果有） */
  topRecommendation?: {
    optionId: string;
    rationale: string;
  };
  /** 推荐理由 */
  recommendationRationale?: string;
  /** 与用户选择的一致性 */
  alignmentWithUserChoice?: number;
}

/**
 * 预期结果
 */
export interface ExpectedOutcome {
  /** 预期特征 */
  expectedCharacteristics?: Record<string, any>;
  /** 预期体验 */
  expectedExperience?: string;
  /** 预期风险 */
  expectedRisks?: string[];
  /** 预期满意度（1-10） */
  expectedSatisfaction?: number;
}

/**
 * 实际结果
 */
export interface ActualOutcome {
  /** 实际特征 */
  actualCharacteristics?: Record<string, any>;
  /** 实际体验 */
  actualExperience?: string;
  /** 实际风险 */
  actualRisks?: string[];
  /** 实际满意度（1-10） */
  actualSatisfaction?: number;
}

/**
 * 偏差分析
 */
export interface Deviation {
  /** 偏差类型 */
  type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  /** 偏差描述 */
  description: string;
  /** 偏差程度（0-1） */
  magnitude: number;
  /** 偏差详情 */
  details?: Record<string, any>;
}

/**
 * 学习信号
 */
export interface LearningSignals {
  /** 用户偏好信号 */
  preferenceSignals?: Record<string, any>;
  /** 决策模式信号 */
  decisionPatternSignals?: Record<string, any>;
  /** 改进建议 */
  improvementSuggestions?: string[];
}
