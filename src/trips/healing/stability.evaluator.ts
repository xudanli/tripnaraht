/**
 * Stability Evaluator — 判断是否可以停止重算（收敛条件）
 */

import type { StabilityMetricsInput } from './stability.metrics';

export type { StabilityMetricsInput } from './stability.metrics';

export interface StabilityScore {
  readonly stable: boolean;
  readonly score: number;
}

const DEFAULT_VELOCITY_THRESHOLD = 8;

/**
 * 加权评分（与产品约定对齐）：高严重问题 / 中等问题数量 / diff 速率。
 */
export function evaluateStability(
  metrics: StabilityMetricsInput,
  options?: { readonly velocityThreshold?: number },
): StabilityScore {
  const threshold = options?.velocityThreshold ?? DEFAULT_VELOCITY_THRESHOLD;

  const score =
    (metrics.highSeverityIssues === 0 ? 0.5 : 0) +
    (metrics.mediumIssues < 2 ? 0.3 : 0) +
    (metrics.deltaVelocity < threshold ? 0.2 : 0);

  return {
    stable: score > 0.85,
    score,
  };
}

/** 极简布尔收敛（与控制器内部自检对齐） */
export function isStableSnapshot(metrics: StabilityMetricsInput): boolean {
  return (
    metrics.deltaCount === 0 &&
    metrics.highSeverityIssues === 0 &&
    metrics.pendingReplans === 0
  );
}
