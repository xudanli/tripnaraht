/**
 * Shadow comparison: Legacy utility / direct finalize vs optimization strategy.
 * @deprecated Detailed events — use buildOptimizationShadowEvent + OptimizationShadowEvent.
 */

export {
  compareOptimizationShadow,
  buildOptimizationShadowEvent,
  toLegacyShadowComparison,
} from './shadow-divergence-builder.util';

export type {
  OptimizationShadowComparison,
  OptimizationShadowEvent,
  ShadowDivergenceType,
  DivergenceSeverity,
} from './shadow-divergence.types';

import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import { isLegacyFeasibleFromReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';

export interface PlanSelectionShadowComparison {
  legacyWinnerId?: string;
  canonicalSelectedId?: string;
  diverged: boolean;
  legacyFeasibleCount: number;
  canonicalRejectedCount: number;
}

export function compareLegacyVsCanonicalWinner(input: {
  candidates: DecisionCandidate[];
  constraintReports: Record<string, CanonicalConstraintReport>;
  selectedCandidateId?: string;
}): PlanSelectionShadowComparison {
  let legacyWinnerId: string | undefined;
  let bestUtility = Number.NEGATIVE_INFINITY;
  let legacyFeasibleCount = 0;

  for (const candidate of input.candidates) {
    const report = input.constraintReports[candidate.candidateId];
    if (!report || !isLegacyFeasibleFromReport(report)) continue;
    legacyFeasibleCount += 1;
    const utility = candidate.utilityHint ?? 0;
    if (utility > bestUtility) {
      bestUtility = utility;
      legacyWinnerId = candidate.candidateId;
    }
  }

  const canonicalSelectedId = input.selectedCandidateId;
  const diverged =
    legacyWinnerId != null &&
    canonicalSelectedId != null &&
    legacyWinnerId !== canonicalSelectedId;

  const canonicalRejectedCount = input.candidates.filter((c) => {
    const report = input.constraintReports[c.candidateId];
    return report?.overallStatus === 'INFEASIBLE' || report?.overallStatus === 'UNVERIFIED';
  }).length;

  return {
    legacyWinnerId,
    canonicalSelectedId,
    diverged,
    legacyFeasibleCount,
    canonicalRejectedCount,
  };
}
