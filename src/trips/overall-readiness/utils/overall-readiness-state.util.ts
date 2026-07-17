/**
 * 整体准备度状态判定 — 分数与就绪分离
 */

import type {
  OverallReadinessState,
  ReadinessDimension,
  ReadinessIssue,
} from '../types/overall-trip-readiness.types';

export const OVERALL_READINESS_STATE_LABELS_ZH: Record<OverallReadinessState, string> = {
  NOT_STARTED: '尚未开始',
  IN_PROGRESS: '准备中',
  NEAR_READY: '接近就绪',
  READY: '已准备好',
  BLOCKED: '已阻塞',
  NEEDS_REVALIDATION: '需要重新验证',
};

export function resolveOverallReadinessState(input: {
  score: number;
  dimensions: ReadinessDimension[];
  blockers: ReadinessIssue[];
  evidenceConfidence: number;
  needsRevalidation: boolean;
}): OverallReadinessState {
  if (input.needsRevalidation) {
    return 'NEEDS_REVALIDATION';
  }

  if (input.blockers.length > 0) {
    return 'BLOCKED';
  }

  const allDimensionsOk = input.dimensions.every((d) => d.score >= 70);
  if (
    input.score >= 85 &&
    allDimensionsOk &&
    input.evidenceConfidence >= 80
  ) {
    return 'READY';
  }

  if (input.score >= 70) {
    return 'NEAR_READY';
  }

  if (input.score >= 30) {
    return 'IN_PROGRESS';
  }

  return 'NOT_STARTED';
}

export function resolveDimensionState(
  score: number,
  blockerCount: number,
): OverallReadinessState {
  if (blockerCount > 0) return 'BLOCKED';
  if (score >= 85) return 'READY';
  if (score >= 70) return 'NEAR_READY';
  if (score >= 30) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}
