/**
 * Separates benchmark execution completion from review-queue disposition.
 */

import type { BenchmarkInstanceExecution } from './benchmark-run.types';

export type BenchmarkReviewDisposition = 'MATERIALIZED' | 'EXCLUDED' | 'NOT_APPLICABLE';

export function deriveReviewDisposition(
  execution: Pick<
    BenchmarkInstanceExecution,
    'status' | 'exclusionReason' | 'reviewCaseId' | 'eligibleForStrategyComparison'
  >,
): BenchmarkReviewDisposition {
  if (execution.reviewCaseId) return 'MATERIALIZED';
  if (execution.exclusionReason) return 'EXCLUDED';
  if (execution.status === 'EXCLUDED') return 'EXCLUDED';
  if (execution.eligibleForStrategyComparison === false) return 'EXCLUDED';
  return 'NOT_APPLICABLE';
}

export function isReviewExcluded(
  execution: Pick<
    BenchmarkInstanceExecution,
    'status' | 'exclusionReason' | 'reviewCaseId' | 'eligibleForStrategyComparison'
  >,
): boolean {
  return deriveReviewDisposition(execution) === 'EXCLUDED';
}

/** Materialize API skip reasons that complete the instance as EXCLUDED (not retryable failure). */
export function isMaterializeExclusionSkipReason(reason: string): boolean {
  switch (reason) {
    case 'SAME_WINNER':
    case 'MISSING_WINNER':
    case 'ALL_INFEASIBLE':
    case 'NOT_ELIGIBLE_FOR_STRATEGY_COMPARISON':
    case 'INPUT_MISMATCH':
    case 'SHADOW_ERROR':
    case 'SHADOW_TIMEOUT':
    case 'NO_SHADOW_RESULT':
    case 'CRITICAL_DIVERGENCE':
    case 'SHADOW_NOT_SUCCESSFUL':
      return true;
    default:
      return reason.includes('NOT_ELIGIBLE') || reason.includes('EXCLUDED');
  }
}

export interface MaterializeResultArtifact {
  reviewCaseId?: string;
  skipped?: Array<{ comparisonId: string; reason: string }>;
  materialized?: Array<{ reviewCaseId: string; comparisonId: string }>;
}

export function resolveMaterializeSkipReason(
  artifact: MaterializeResultArtifact | undefined,
  comparisonId: string | undefined,
): string | undefined {
  if (!artifact?.skipped?.length || !comparisonId) return undefined;
  return artifact.skipped.find((s) => s.comparisonId === comparisonId)?.reason;
}
