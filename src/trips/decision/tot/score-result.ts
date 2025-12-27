// src/trips/decision/tot/score-result.ts

/**
 * ToT 评分结果类型定义
 * 
 * 统一的结果结构，便于日志和对比
 */

/**
 * 工具函数：将值限制在 [0, 1] 区间
 */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * ToT 评分结果
 */
export interface ToTScoreResult {
  /** 是否通过硬门控 */
  allowed: boolean;
  /** 硬违规列表 */
  hardViolations: string[];
  /** 总分 (0..100) */
  score: number;
  /** 各维度得分 (0..1) */
  dims: {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
  };
  /** 各维度权重（归一化后） */
  weights: {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
  };
  /** 详细指标（用于日志和调试） */
  metrics: Record<string, number | string | boolean | object>;
}

/**
 * 归一化权重
 */
export function normalizeWeights(weights: {
  cost: number;
  risk: number;
  pref: number;
  time: number;
  req: number;
}): {
  cost: number;
  risk: number;
  pref: number;
  time: number;
  req: number;
} {
  const sum = weights.cost + weights.risk + weights.pref + weights.time + weights.req;
  if (sum === 0) {
    // 如果总和为 0，使用均匀权重
    return {
      cost: 0.2,
      risk: 0.2,
      pref: 0.2,
      time: 0.2,
      req: 0.2,
    };
  }

  return {
    cost: weights.cost / sum,
    risk: weights.risk / sum,
    pref: weights.pref / sum,
    time: weights.time / sum,
    req: weights.req / sum,
  };
}

/**
 * 创建拒绝结果
 */
export function createRejectedResult(
  hardViolations: string[]
): ToTScoreResult {
  return {
    allowed: false,
    hardViolations,
    score: 0,
    dims: {
      cost: 0,
      risk: 0,
      pref: 0,
      time: 0,
      req: 0,
    },
    weights: {
      cost: 0,
      risk: 0,
      pref: 0,
      time: 0,
      req: 0,
    },
    metrics: {
      hardGateRejected: true,
      violations: hardViolations.join(', '),
    },
  };
}

/**
 * 创建通过结果
 */
export function createAllowedResult(
  dims: { cost: number; risk: number; pref: number; time: number; req: number },
  weights: { cost: number; risk: number; pref: number; time: number; req: number },
  totalScore: number,
  metrics: Record<string, number | string | boolean | object>
): ToTScoreResult {
  return {
    allowed: true,
    hardViolations: [],
    score: Math.round(totalScore * 100), // 0..100
    dims,
    weights: normalizeWeights(weights),
    metrics: {
      ...metrics,
      totalScore,
      weightCost: weights.cost,
      weightRisk: weights.risk,
      weightPref: weights.pref,
      weightTime: weights.time,
      weightReq: weights.req,
    },
  };
}

