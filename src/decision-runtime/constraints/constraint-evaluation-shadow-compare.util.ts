/**
 * Compare legacy boolean feasibility vs CanonicalConstraintReport (SHADOW_COMPARE mode).
 */

import type { CanonicalConstraintReport } from './contracts/canonical-constraint-report';
import { isLegacyFeasibleFromReport } from './contracts/canonical-constraint-report';

export const CONSTRAINT_SHADOW_COMPARISON_SCHEMA_ID =
  'tripnara.constraint_shadow_comparison@v1';

export type ConstraintShadowDivergenceKind =
  | 'ALIGNED'
  | 'LEGACY_PASS_CANONICAL_BLOCK'
  | 'LEGACY_BLOCK_CANONICAL_PASS'
  | 'LEGACY_PASS_CANONICAL_UNVERIFIED'
  | 'UNKNOWN_MISMATCH';

export interface ConstraintEvaluationShadowComparison {
  schemaId: typeof CONSTRAINT_SHADOW_COMPARISON_SCHEMA_ID;
  diverged: boolean;
  legacyFeasible: boolean;
  canonicalOverallStatus: CanonicalConstraintReport['overallStatus'];
  canonicalLegacyFeasible: boolean;
  divergenceKind: ConstraintShadowDivergenceKind;
  comparedAt: string;
}

export function buildConstraintEvaluationShadowComparison(input: {
  legacyFeasible: boolean;
  canonicalReport: CanonicalConstraintReport;
}): ConstraintEvaluationShadowComparison {
  const canonicalLegacyFeasible = isLegacyFeasibleFromReport(input.canonicalReport);
  const divergenceKind = classifyConstraintShadowDivergence({
    legacyFeasible: input.legacyFeasible,
    canonicalLegacyFeasible,
    overallStatus: input.canonicalReport.overallStatus,
  });

  return {
    schemaId: CONSTRAINT_SHADOW_COMPARISON_SCHEMA_ID,
    diverged: divergenceKind !== 'ALIGNED',
    legacyFeasible: input.legacyFeasible,
    canonicalOverallStatus: input.canonicalReport.overallStatus,
    canonicalLegacyFeasible,
    divergenceKind,
    comparedAt: new Date().toISOString(),
  };
}

function classifyConstraintShadowDivergence(input: {
  legacyFeasible: boolean;
  canonicalLegacyFeasible: boolean;
  overallStatus: CanonicalConstraintReport['overallStatus'];
}): ConstraintShadowDivergenceKind {
  if (
    input.legacyFeasible === input.canonicalLegacyFeasible &&
    (input.legacyFeasible || input.overallStatus !== 'UNVERIFIED')
  ) {
    return 'ALIGNED';
  }

  if (input.legacyFeasible && !input.canonicalLegacyFeasible) {
    if (input.overallStatus === 'UNVERIFIED') {
      return 'LEGACY_PASS_CANONICAL_UNVERIFIED';
    }
    return 'LEGACY_PASS_CANONICAL_BLOCK';
  }

  if (!input.legacyFeasible && input.canonicalLegacyFeasible) {
    return 'LEGACY_BLOCK_CANONICAL_PASS';
  }

  return 'UNKNOWN_MISMATCH';
}
