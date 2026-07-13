import type { GuideTravelContext } from '../types/guide-to-plan.types';

export interface GuideFeasibilityInput {
  warnings: string[];
  unmatchedPlaceCount: number;
  placeCount: number;
  comparisonDiffCount: number;
  drivingIssueCount: number;
  constraintBlockCount?: number;
  travelContext?: GuideTravelContext | null;
  sourceConfidence?: number;
}

/**
 * 草案准备度 0–100（启发式；非 Readiness 全量评分）。
 */
export function computeGuideFeasibilityScore(input: GuideFeasibilityInput): number {
  let score = 72;

  if (!input.travelContext?.startDate || !input.travelContext?.endDate) {
    score -= 12;
  }
  if (input.placeCount > 0 && input.unmatchedPlaceCount > 0) {
    score -= Math.min(18, Math.round((input.unmatchedPlaceCount / input.placeCount) * 24));
  }

  score -= Math.min(15, input.comparisonDiffCount * 2);
  score -= Math.min(20, input.drivingIssueCount * 8);
  score -= Math.min(25, (input.constraintBlockCount ?? 0) * 12);
  score -= Math.min(12, input.warnings.length * 3);

  const confidence = input.sourceConfidence ?? 0.3;
  score -= Math.round((1 - confidence) * 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}
