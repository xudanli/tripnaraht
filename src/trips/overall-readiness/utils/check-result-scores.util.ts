/**
 * 检查项结果 → 分数 / 维度得分 / 证据可信系数
 */

import type {
  ReadinessCheck,
  ReadinessCheckResult,
  ReadinessEvidenceType,
} from '../types/overall-trip-readiness.types';

export const CHECK_RESULT_SCORES: Record<
  Exclude<ReadinessCheckResult, 'NOT_APPLICABLE'>,
  number
> = {
  VERIFIED_READY: 100,
  READY_UNVERIFIED: 75,
  PARTIAL: 50,
  NOT_READY: 20,
  FAILED: 0,
};

export const EVIDENCE_TYPE_CONFIDENCE: Record<ReadinessEvidenceType, number> = {
  OFFICIAL_API: 1,
  BOOKING_CONFIRMATION: 1,
  OPERATOR_CONFIRMATION: 0.95,
  USER_CONFIRMATION: 0.95,
  PARTNER_API: 0.9,
  WEB_SOURCE: 0.85,
  AI_INFERENCE: 0.6,
  NO_SOURCE: 0.3,
};

export function scoreForCheckResult(result: ReadinessCheckResult): number | null {
  if (result === 'NOT_APPLICABLE') return null;
  return CHECK_RESULT_SCORES[result];
}

/** 维度得分 = Σ(检查项得分 × 权重) / Σ适用权重 */
export function computeDimensionScoreFromChecks(checks: ReadinessCheck[]): number {
  let weighted = 0;
  let weightSum = 0;

  for (const check of checks) {
    if (check.result === 'NOT_APPLICABLE') continue;
    const w = check.weight > 0 ? check.weight : 0;
    if (w <= 0) continue;
    weighted += check.score * w;
    weightSum += w;
  }

  if (weightSum <= 0) return 100;
  return Math.round(Math.max(0, Math.min(100, weighted / weightSum)));
}

export function averageEvidenceConfidence(confidences: number[]): number {
  if (confidences.length === 0) return 0.6;
  const sum = confidences.reduce((a, b) => a + b, 0);
  return Math.round((sum / confidences.length) * 100);
}
