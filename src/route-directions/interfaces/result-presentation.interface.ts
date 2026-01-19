// src/route-directions/interfaces/result-presentation.interface.ts

/**
 * 结果呈现接口定义
 * 
 * 基于 ROUTE_STRUCTURE_THEORY_COMPLIANCE.md 的P2要求：
 * - 输出格式优化
 * - 替代方案生成
 * - 完善三层解释结构
 */

import { RouteDirectionData } from './route-direction.interface';
import { RouteExistenceJudgment } from './route-judgment.interface';
import { ComprehensiveRiskAssessment } from './enhanced-risk-assessment.interface';
import { RhythmMatchResult } from '../../trips/decision/interfaces/rhythm-matching.interface';
import { ThreeLayerExplanation } from '../../trips/decision/interfaces/three-layer-explanation.interface';

/**
 * 整合判断结果
 */
export interface IntegratedJudgmentResult {
  /** 存在性判断 */
  existenceJudgment: RouteExistenceJudgment;
  /** 风险评估 */
  riskAssessment: ComprehensiveRiskAssessment;
  /** 节奏匹配结果 */
  rhythmMatching: RhythmMatchResult;
  /** 综合建议 */
  overallRecommendation: {
    conclusion: 'RECOMMEND' | 'CONDITIONAL_RECOMMEND' | 'NOT_RECOMMEND';
    score: number; // 0-1
    summary: string;
  };
  /** 三层解释 */
  explanation: ThreeLayerExplanation;
  /** 替代方案 */
  alternatives: AlternativeRouteOption[];
  /** 格式化输出 */
  formattedOutput: FormattedResultOutput;
}

/**
 * 替代路线选项
 */
export interface AlternativeRouteOption {
  /** 路线ID */
  routeId: string;
  /** 路线名称 */
  routeName: string;
  /** 路线数据 */
  route: RouteDirectionData;
  /** 为什么是替代方案 */
  reason: string;
  /** 与原始路线的差异 */
  differences: {
    advantages: string[];
    disadvantages: string[];
  };
  /** 适用场景 */
  suitableFor: string[];
  /** 匹配度评分 */
  matchScore: number; // 0-1
}

/**
 * 格式化结果输出
 */
export interface FormattedResultOutput {
  /** 标题 */
  title: string;
  /** 存在性判断部分 */
  existenceSection: {
    title: string;
    status: string;
    details: string[];
    formatted: string;
  };
  /** 风险评估部分 */
  riskSection: {
    title: string;
    summary: string;
    details: Array<{
      category: string;
      level: string;
      emoji: string;
      description: string;
    }>;
    formatted: string;
  };
  /** 节奏建议部分 */
  rhythmSection: {
    title: string;
    recommendedRhythm: string;
    reason: string;
    adjustments: string[];
    formatted: string;
  };
  /** 综合建议部分 */
  recommendationSection: {
    title: string;
    conclusion: string;
    score: number;
    summary: string;
    formatted: string;
  };
  /** 替代方案部分 */
  alternativesSection: {
    title: string;
    alternatives: Array<{
      name: string;
      reason: string;
      matchScore: number;
    }>;
    formatted: string;
  };
  /** 完整格式化输出 */
  fullFormatted: string;
}
