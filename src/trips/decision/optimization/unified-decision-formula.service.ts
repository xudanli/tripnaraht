/**
 * Unified Decision Formula Service
 *
 * 专利升级点①：统一决策公式 U(a)
 * 本发明中决策内核基于统一效用函数计算候选方案优先级
 *
 * 公式：U(a) = Σ wi·Fi(State, Context) − Σ λj·ConstraintViolationj − RiskPenalty + PreferenceScore
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.3.1
 */

import { Injectable } from '@nestjs/common';

/** 多维评价函数得分 (Fi)，0-1 归一化 */
export interface DimensionScores {
  safety?: number;
  experienceDensity?: number;
  philosophyAlignment?: number;
  timeSlack?: number;
  [key: string]: number | undefined;
}

/** 约束违反项 */
export interface ConstraintViolation {
  type: string;
  severity: 'HARD' | 'SOFT';
  degree: number; // 0-1，违反程度
}

/** 统一决策公式输入 */
export interface UnifiedDecisionFormulaInput {
  /** 多维评价函数得分 Fi(State, Context) */
  dimensionScores: DimensionScores;
  /** 各维度权重 wi（可配置，Phase 2 可学习） */
  weights: Record<string, number>;
  /** 约束违反列表 */
  constraintViolations: ConstraintViolation[];
  /** 约束惩罚系数 λj，HARD 可用大值近似 ∞ */
  constraintPenaltyCoefficients?: Record<string, number>;
  /** 风险成本（天气、疲劳、预算等） */
  riskPenalty: number;
  /** 用户偏好增益 */
  preferenceScore: number;
}

/** 默认权重（与 objective-function.interface 对齐） */
export const DEFAULT_UNIFIED_WEIGHTS: Record<string, number> = {
  safety: 0.25,
  experienceDensity: 0.2,
  philosophyAlignment: 0.15,
  timeSlack: 0.1,
  fatigueRisk: 0.15,
  weatherRisk: 0.05,
  budgetOverrun: 0.05,
  pacingVariance: 0.05,
};

/** Hard 约束惩罚系数（近似无穷大，使 U(a)→-∞） */
const HARD_CONSTRAINT_PENALTY = 1e6;

@Injectable()
export class UnifiedDecisionFormulaService {
  /**
   * 计算统一决策得分 U(a)
   * 专利公式：U(a) = Σ wi·Fi − Σ λj·ConstraintViolationj − RiskPenalty + PreferenceScore
   */
  computeUnifiedScore(input: UnifiedDecisionFormulaInput): number {
    const {
      dimensionScores,
      weights,
      constraintViolations,
      constraintPenaltyCoefficients = {},
      riskPenalty,
      preferenceScore,
    } = input;

    // Σ wi · Fi(State, Context) — 正向效用
    let utilitySum = 0;
    let weightSum = 0;
    for (const [dim, score] of Object.entries(dimensionScores)) {
      const w = weights[dim] ?? 0;
      if (w > 0 && score !== undefined && !Number.isNaN(score)) {
        utilitySum += w * Math.max(0, Math.min(1, score));
        weightSum += w;
      }
    }
    const normalizedUtility = weightSum > 0 ? utilitySum / weightSum : 0;

    // Σ λj · ConstraintViolationj — 约束惩罚
    let constraintPenalty = 0;
    for (const v of constraintViolations) {
      const lambda =
        v.severity === 'HARD'
          ? HARD_CONSTRAINT_PENALTY
          : constraintPenaltyCoefficients[v.type] ?? 0.5;
      constraintPenalty += lambda * Math.max(0, Math.min(1, v.degree));
    }

    // 若存在 Hard 违反，U(a) 直接为负无穷（不可行）
    if (constraintViolations.some((v) => v.severity === 'HARD' && v.degree > 0)) {
      return -Infinity;
    }

    // U(a) = Utility − ConstraintPenalty − RiskPenalty + PreferenceScore
    const risk = Math.max(0, Math.min(1, riskPenalty));
    const pref = Math.max(0, Math.min(1, preferenceScore));

    return normalizedUtility - constraintPenalty - risk + pref;
  }

  /**
   * 轻量级版本：从 OptimizationHints 的 dimensionBreakdown 计算
   * 用于 OptimizationEngineAdapter 的 getHints 路径
   */
  computeFromDimensionBreakdown(
    dimensionBreakdown: {
      fatigue?: number;
      weather?: number;
      budget?: number;
      crowdAvoidance?: number;
    },
    safetyTrend?: 'LOW' | 'MEDIUM' | 'HIGH',
    fatigueTrend?: 'LOW' | 'MEDIUM' | 'HIGH',
    preferenceScore = 0,
  ): number {
    const safetyScore =
      safetyTrend === 'HIGH' ? 0.3 : safetyTrend === 'MEDIUM' ? 0.6 : safetyTrend === 'LOW' ? 1.0 : 0.7;
    const fatiguePenalty =
      fatigueTrend === 'HIGH' ? 0.4 : fatigueTrend === 'MEDIUM' ? 0.2 : fatigueTrend === 'LOW' ? 0 : 0.1;
    const weatherPenalty = dimensionBreakdown.weather ?? 0;
    const budgetPenalty = dimensionBreakdown.budget ?? 0;

    const riskPenalty = 0.4 * fatiguePenalty + 0.3 * weatherPenalty + 0.2 * budgetPenalty;
    const utility = 0.6 * safetyScore + 0.4 * (1 - fatiguePenalty);

    return Math.max(0, Math.min(1, utility - riskPenalty + preferenceScore));
  }
}
