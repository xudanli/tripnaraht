/**
 * Canonical constraint evaluation — unified output from all constraint providers.
 * Extends ADR-006 ConstraintAssertion with action policy and relaxability.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { EvidenceReference } from './evidence-reference';

export type {
  ConstraintEvaluationStatus,
  ConstraintAssertionSeverity,
} from '../constraints/contracts/constraint-assertion';

import type {
  ConstraintEvaluationStatus,
  ConstraintAssertionSeverity,
  ConstraintAssertionScope,
  ConstraintAssertionEvaluator,
} from '../constraints/contracts/constraint-assertion';

export type ConstraintEvidenceStatus =
  | 'FRESH'
  | 'STALE'
  | 'MISSING'
  | 'LOW_CONFIDENCE';

export type ConstraintActionPolicy =
  | 'ALLOW'
  | 'ALLOW_WITH_WARNING'
  | 'VERIFY'
  | 'REJECT'
  | 'DEGRADE';

export type ConstraintRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** L1 = safety/regulatory; never relaxable. L2-L5 = progressively softer. */
export type ConstraintTier = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface ConstraintEvaluation {
  constraintId: string;
  constraintType: string;
  tier: ConstraintTier;

  evaluationStatus: ConstraintEvaluationStatus;
  evidenceStatus: ConstraintEvidenceStatus;
  actionPolicy: ConstraintActionPolicy;
  riskLevel: ConstraintRiskLevel;

  /** When true, candidate cannot enter optimization without explicit override path */
  mandatory: boolean;
  /** When false, constraint may never be relaxed (L1 safety defaults) */
  relaxable: boolean;

  severity: ConstraintAssertionSeverity;
  scope: ConstraintAssertionScope;
  reasonCode: string;
  message: string;
  remediationHints?: string[];

  evidenceRefs: EvidenceReference[];
  evaluator: ConstraintAssertionEvaluator;
  confidence?: number;
}
