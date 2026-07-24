/**
 * Build ResultSummary from strategy output or authority finalize path.
 */

import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import { isLegacyFeasibleFromReport } from '../constraints/contracts/canonical-constraint-report';
import type { OptimizationResult } from '../contracts/optimization-result';
import type { ResultSummary } from './shadow-divergence.types';

export const AUTHORITY_FINALIZE_STRATEGY_ID = 'decision-core-finalize';

export function buildResultSummaryFromOptimization(
  result: OptimizationResult,
  report?: CanonicalConstraintReport,
): ResultSummary {
  const timedOut = result.terminationReason === 'TIME_LIMIT';
  const success =
    result.terminationReason !== 'ERROR' &&
    (result.hasIncumbent || result.feasibilityStatus === 'FEASIBLE');

  const rankedTop3 = rankTopCandidates(result);

  return {
    strategyId: result.solverMetadata.strategyId,
    strategyVersion: result.solverMetadata.strategyVersion,
    solverEngine: result.solverMetadata.solverEngine,
    solverFamily: result.solverMetadata.solverFamily,
    optimizationLevel: result.solverMetadata.optimizationLevel,
    nativeCpSat: result.solverMetadata.nativeCpSat,
    success,
    timedOut,
    selectedCandidateId: result.recommendedCandidateId,
    feasibilityStatus: result.feasibilityStatus,
    terminationReason: result.terminationReason,
    hasIncumbent: result.hasIncumbent,
    elapsedMs: result.solverMetadata.elapsedMs,
    rankedTop3,
    hardViolation: report != null && !isLegacyFeasibleFromReport(report),
    postValidationRejected: false,
  };
}

export function buildAuthorityFinalizeSummary(input: {
  selectedCandidateId?: string;
  candidates: Array<{ candidateId: string; utilityHint?: number }>;
  report?: CanonicalConstraintReport;
  elapsedMs?: number;
}): ResultSummary {
  const rankedTop3 = [...input.candidates]
    .sort((a, b) => (b.utilityHint ?? 0) - (a.utilityHint ?? 0))
    .slice(0, 3)
    .map((c) => c.candidateId);

  return {
    strategyId: AUTHORITY_FINALIZE_STRATEGY_ID,
    strategyVersion: '1.0.0',
    success: input.selectedCandidateId != null,
    timedOut: false,
    selectedCandidateId: input.selectedCandidateId,
    feasibilityStatus: 'FEASIBLE',
    terminationReason: 'OPTIMAL',
    hasIncumbent: input.selectedCandidateId != null,
    elapsedMs: input.elapsedMs ?? 0,
    rankedTop3,
    hardViolation:
      input.report != null &&
      input.selectedCandidateId != null &&
      !isLegacyFeasibleFromReport(input.report),
    postValidationRejected: false,
  };
}

export function buildShadowErrorSummary(input: {
  strategyId: string;
  strategyVersion: string;
  error: string;
  elapsedMs?: number;
}): ResultSummary {
  return {
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    success: false,
    timedOut: false,
    error: input.error,
    feasibilityStatus: 'UNVERIFIED',
    terminationReason: 'ERROR',
    hasIncumbent: false,
    elapsedMs: input.elapsedMs ?? 0,
    rankedTop3: [],
    hardViolation: false,
    postValidationRejected: false,
  };
}

function rankTopCandidates(result: OptimizationResult): string[] {
  const rankTrace = result.optimizationTrace?.steps?.find(
    (s) => s.kind === 'CP_SAT_LEX_LAB_V0' || s.kind === 'CP_SAT_LEX_V1',
  )?.detail?.rankTrace as Array<{ candidateId: string }> | undefined;

  if (rankTrace?.length) {
    return rankTrace.slice(0, 3).map((r) => r.candidateId);
  }

  if (result.recommendedCandidateId) {
    const rest = result.candidates
      .map((c) => c.candidateId)
      .filter((id) => id !== result.recommendedCandidateId);
    return [result.recommendedCandidateId, ...rest].slice(0, 3);
  }

  return result.candidates.slice(0, 3).map((c) => c.candidateId);
}
