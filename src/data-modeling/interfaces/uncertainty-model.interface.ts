// src/data-modeling/interfaces/uncertainty-model.interface.ts

/**
 * 不确定性建模接口定义
 * 
 * 基于 DECISION_MODELING_COMPLIANCE.md 的要求：
 * - 概率分布模型
 * - 置信区间（lower_bound, upper_bound）
 * - 不确定性等级（低/中/高）
 * - 情景分析（最好/最坏/最可能）
 */

import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';

/**
 * 不确定性来源类型
 */
export type UncertaintySourceType =
  | 'WEATHER'
  | 'CROWD'
  | 'USER_CAPACITY'
  | 'TRANSPORT'
  | 'EXPERIENCE'
  | 'ROUTE_CONDITION'
  | 'COST'
  | 'DURATION';

/**
 * 不确定性等级
 */
export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 不确定性模型
 */
export interface UncertaintyModel {
  /** 来源类型 */
  sourceType: UncertaintySourceType;
  /** 最佳估计值 */
  bestEstimate: number;
  /** 下界（5%分位数） */
  lowerBound: number;
  /** 上界（95%分位数） */
  upperBound: number;
  /** 置信度（0-1） */
  confidence: number;
  /** 数据来源信息 */
  dataSource: ExtendedDataSourceInfo;
  /** 不确定性等级 */
  uncertaintyLevel: UncertaintyLevel;
  /** 概率分布类型 */
  distributionType?: 'NORMAL' | 'UNIFORM' | 'TRIANGULAR' | 'BETA';
  /** 分布参数 */
  distributionParams?: Record<string, number>;
}

/**
 * 情景结果
 */
export interface ScenarioResult {
  /** 风险评分 */
  risk: number;
  /** 成本 */
  cost?: number;
  /** 时间 */
  duration?: number;
  /** 体验评分 */
  experience?: number;
  /** 可行性 */
  feasibility: boolean;
  /** 说明 */
  explanation: string;
}

/**
 * 情景分析结果
 */
export interface ScenarioAnalysis {
  /** 最好情况 */
  bestCase: ScenarioResult;
  /** 基准情况（最可能） */
  baseCase: ScenarioResult;
  /** 最坏情况 */
  worstCase: ScenarioResult;
  /** 上行潜力（最好情况相对于基准情况的改善） */
  upsidePotential: number;
  /** 下行风险（最坏情况相对于基准情况的风险） */
  downsideRisk: number;
}

/**
 * 用户友好的不确定性展示
 */
export interface UserFacingUncertaintyDisplay {
  /** 说明文字 */
  what: string;
  /** 范围说明 */
  range: string;
  /** 详细解释 */
  explanation: string;
  /** 可视化数据（可选） */
  visualization?: {
    type: 'BAR' | 'LINE' | 'DISTRIBUTION';
    data: any;
  };
  /** 不确定性等级标签 */
  levelLabel: string;
  /** 建议 */
  suggestion?: string;
}

/**
 * 风险评估结果（考虑不确定性）
 */
export interface RiskAssessmentWithUncertainty {
  /** 基准情况风险 */
  baseCaseRisk: number;
  /** 最好情况风险 */
  bestCaseRisk: number;
  /** 最坏情况风险 */
  worstCaseRisk: number;
  /** 上行潜力 */
  upsidePotential: number;
  /** 下行风险 */
  downsideRisk: number;
  /** 推荐 */
  recommendation: string;
  /** 不确定性展示列表 */
  uncertaintyDisplay: UserFacingUncertaintyDisplay[];
}
