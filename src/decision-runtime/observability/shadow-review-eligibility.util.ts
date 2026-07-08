/**
 * Eligibility rules for blind shadow review cases.
 */

import type { OptimizationShadowEvent, ShadowDivergenceType } from './shadow-divergence.types';

const REVIEW_EXCLUSION_TYPES: ShadowDivergenceType[] = [
  'INPUT_MISMATCH',
  'SHADOW_ERROR',
  'SHADOW_TIMEOUT',
  'NO_SHADOW_RESULT',
];

export interface ShadowReviewEligibility {
  eligible: boolean;
  exclusionReason?: string;
}

export function assessShadowReviewEligibility(
  event: OptimizationShadowEvent,
): ShadowReviewEligibility {
  if (!event.eligibleForStrategyComparison) {
    return { eligible: false, exclusionReason: 'NOT_ELIGIBLE_FOR_STRATEGY_COMPARISON' };
  }

  for (const t of REVIEW_EXCLUSION_TYPES) {
    if (event.divergence.types.includes(t)) {
      return { eligible: false, exclusionReason: t };
    }
  }

  if (event.divergence.severity === 'CRITICAL') {
    return { eligible: false, exclusionReason: 'CRITICAL_DIVERGENCE' };
  }

  const authorityId = event.authorityResult.selectedCandidateId;
  const shadowId = event.shadowResult?.selectedCandidateId;

  if (!authorityId || !shadowId) {
    return { eligible: false, exclusionReason: 'MISSING_WINNER' };
  }

  if (authorityId === shadowId || event.divergence.sameWinner) {
    return { eligible: false, exclusionReason: 'SAME_WINNER' };
  }

  if (!event.authorityResult.hasIncumbent && !event.shadowResult?.hasIncumbent) {
    return { eligible: false, exclusionReason: 'ALL_INFEASIBLE' };
  }

  if (!event.shadowResult?.success) {
    return { eligible: false, exclusionReason: 'SHADOW_NOT_SUCCESSFUL' };
  }

  return { eligible: true };
}
