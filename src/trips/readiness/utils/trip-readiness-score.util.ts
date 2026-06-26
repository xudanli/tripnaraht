import type { CoverageGap, SegmentCoverage } from '../types/coverage-map.types';
import {
  filterRisksForTripPhase,
  getTripReadinessPhase,
  type TripReadinessPhase,
} from './trip-readiness-relevance.util';

/** 规划期仍应计入交通分数的路段风险（非「出发前再查路况」类） */
const PLANNING_TRANSPORT_HAZARD_TYPES = new Set(['endpoint_uncovered']);

export function calculateTransportCertaintyForPhase(
  segments: SegmentCoverage[],
  phase: TripReadinessPhase,
  poiCount: number,
): number {
  if (phase === 'planning') {
    let score = 88;
    for (const segment of segments) {
      if (segment.coverageStatus === 'blocked') {
        score -= 25;
      }
      for (const hazard of segment.hazards) {
        if (PLANNING_TRANSPORT_HAZARD_TYPES.has(hazard.type)) {
          score -= hazard.severity === 'high' ? 12 : 8;
        }
      }
    }
    if (segments.length === 0 && poiCount > 1) {
      return 80;
    }
    return Math.max(0, Math.min(100, score));
  }

  let score = 100;
  for (const segment of segments) {
    if (segment.coverageStatus === 'blocked') score -= 20;
    else if (segment.coverageStatus === 'warning') score -= 10;
    for (const hazard of segment.hazards) {
      if (hazard.severity === 'high') score -= 8;
      else if (hazard.severity === 'medium') score -= 4;
    }
  }
  if (segments.length === 0 && poiCount > 1) {
    score = 70;
  }
  return Math.max(0, Math.min(100, score));
}

export function calculateSafetyRiskForPhase(
  gaps: CoverageGap[],
  risks: Array<{ severity?: string }>,
  startDate: Date,
  segments: SegmentCoverage[],
): number {
  const phase = getTripReadinessPhase(startDate);
  let score = 100;

  const scoreableGaps =
    phase === 'planning' ? gaps.filter((gap) => gap.type !== 'segment') : gaps;

  for (const gap of scoreableGaps) {
    if (gap.severity === 'high') score -= 15;
    else if (gap.severity === 'medium') score -= 8;
    else score -= 3;
  }

  const scoreableRisks =
    phase === 'planning'
      ? filterRisksForTripPhase(risks as any, startDate).risks
      : risks;

  for (const risk of scoreableRisks) {
    if (risk.severity === 'high') score -= 12;
    else if (risk.severity === 'medium') score -= 6;
    else score -= 2;
  }

  if (phase !== 'planning') {
    for (const segment of segments) {
      if (segment.hazards.some((hazard) => hazard.type === 'road_closure')) {
        score -= 10;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}
