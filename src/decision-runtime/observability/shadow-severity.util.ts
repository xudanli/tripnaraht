/**
 * Divergence severity classification for shadow comparisons.
 */

import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import { isLegacyFeasibleFromReport } from '../constraints/contracts/canonical-constraint-report';
import type {
  DivergenceSeverity,
  ResultSummary,
  ShadowDivergenceType,
  ShadowQualityDeltas,
} from './shadow-divergence.types';

const OBJECTIVE_TOLERANCE = 0.05;

export function classifyShadowSeverity(input: {
  types: ShadowDivergenceType[];
  authority: ResultSummary;
  shadow?: ResultSummary;
  authorityReport?: CanonicalConstraintReport;
  shadowReport?: CanonicalConstraintReport;
  qualityDeltas?: ShadowQualityDeltas;
}): DivergenceSeverity {
  const { types, authority, shadow, authorityReport, shadowReport, qualityDeltas } =
    input;

  if (types.includes('INPUT_MISMATCH')) return 'CRITICAL';
  if (types.includes('SHADOW_ERROR')) return 'HIGH';

  const authorityHard =
    authority.hardViolation ||
    (authorityReport != null && !isLegacyFeasibleFromReport(authorityReport));
  const shadowHard =
    shadow?.hardViolation ||
    (shadowReport != null && !isLegacyFeasibleFromReport(shadowReport));

  if (authorityHard || shadowHard) return 'CRITICAL';
  if (authority.postValidationRejected || shadow?.postValidationRejected) {
    return 'HIGH';
  }

  if (types.includes('SAME_WINNER') || !types.includes('DIFFERENT_WINNER')) {
    const maxDelta = maxQualityDelta(qualityDeltas);
    if (maxDelta <= OBJECTIVE_TOLERANCE) return 'NONE';
    if (maxDelta <= 0.15) return 'LOW';
    return 'MEDIUM';
  }

  const maxDelta = maxQualityDelta(qualityDeltas);
  if (maxDelta <= OBJECTIVE_TOLERANCE) return 'LOW';
  if (maxDelta <= 0.2) return 'MEDIUM';
  return 'MEDIUM';
}

function maxQualityDelta(deltas?: ShadowQualityDeltas): number {
  if (!deltas) return 0;
  return Math.max(
    Math.abs(deltas.corePoiDelta ?? 0),
    Math.abs(deltas.travelTimeDelta ?? 0),
    Math.abs(deltas.loadDelta ?? 0),
    Math.abs(deltas.minMemberUtilityDelta ?? 0),
    Math.abs(deltas.budgetDeviationDelta ?? 0),
  );
}
