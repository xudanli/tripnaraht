/**
 * Canonical constraint evaluation report — SSOT for plan/candidate feasibility.
 * @see ADR-006-Unified-Decision-Runtime.md
 */

import type { ConstraintAssertion } from './constraint-assertion';
import type { WorldStateCompleteness } from './world-state-completeness';
import type { ConstraintEvaluationMode } from './constraint-assessment.types';

export type CanonicalOverallStatus =
  | 'FEASIBLE'
  | 'INFEASIBLE'
  | 'CONDITIONALLY_FEASIBLE'
  | 'UNVERIFIED';

export interface CanonicalConstraintReport {
  schemaId: 'tripnara.canonical_constraint_report@v1';
  /** Stable id for authority_audit_v1.constraintGateway.evaluationId (gateway-produced reports). */
  evaluationId?: string;
  tripId: string;
  candidateId?: string;
  evaluatedAt: string;
  assertions: ConstraintAssertion[];
  completeness: WorldStateCompleteness;
  overallStatus: CanonicalOverallStatus;
  degraded: boolean;
  degradedReasons: string[];
  /** User constraint facts loaded for this evaluation tick (P1) */
  userFacts?: import('./constraint-fact').ConstraintFact[];
  /** Phase 2 — how this report was produced */
  evaluationMode?: ConstraintEvaluationMode;
}

/** @deprecated Use CanonicalConstraintReport.overallStatus — boolean compat only */
export function isLegacyFeasibleFromReport(report: CanonicalConstraintReport): boolean {
  return !report.assertions.some(
    (item) =>
      item.status === 'BLOCK' || item.status === 'REQUIRES_VERIFICATION',
  );
}
