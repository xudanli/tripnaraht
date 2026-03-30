/**
 * Daily Utility 接口定义
 *
 * Phase 2 ExpectedUtility v1：日级 Utility 公式
 *
 * Utility(day) = w_exp×ExperienceScore + w_cost×CostEfficiency + w_time×TimeEfficiency
 *               + w_comfort×ComfortScore + w_safety×SafetyScore
 */

import { PlanDay } from '../../plan-model';

/** 日级 Utility 分项 */
export interface DayUtilityBreakdown {
  experienceScore: number;
  costEfficiency: number;
  timeEfficiency: number;
  comfortScore: number;
  safetyScore: number;
  /** 加权和 */
  totalUtility: number;
}

/** 计划级惩罚项 */
export interface PlanPenalties {
  riskPenalty: number;
  fatiguePenalty: number;
  uncertaintyPenalty: number;
  totalPenalty: number;
}

/** 个性化权重（w = f(user_profile)） */
export interface DailyUtilityWeights {
  w_exp: number;
  w_cost: number;
  w_time: number;
  w_comfort: number;
  w_safety: number;
}

/** 默认权重（v1 专家规则） */
export const DEFAULT_DAILY_UTILITY_WEIGHTS: DailyUtilityWeights = {
  w_exp: 0.35,
  w_cost: 0.2,
  w_time: 0.2,
  w_comfort: 0.15,
  w_safety: 0.1,
};

/** 日级 Utility 计算结果 */
export interface DailyUtilityResult {
  /** 每日 Utility 及分项 */
  dayUtilities: Array<{ day: PlanDay; breakdown: DayUtilityBreakdown }>;
  /** 计划级惩罚 */
  penalties: PlanPenalties;
  /** 总期望效用 */
  totalExpectedUtility: number;
}
