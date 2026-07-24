/**
 * Canonical constraint assertion — unified output from all evaluators.
 * @see ADR-006-Unified-Decision-Runtime.md
 */

export type ConstraintEvaluationStatus =
  | 'PASS'
  | 'BLOCK'
  | 'WARNING'
  | 'UNKNOWN'
  | 'REQUIRES_VERIFICATION';

export type ConstraintAssertionSeverity =
  | 'INFO'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export interface ConstraintAssertionScope {
  tripId: string;
  dayId?: string;
  activityId?: string;
  memberIds?: string[];
  roadSegmentIds?: string[];
  /** Phase 4 — linked PlanObject instances */
  planObjectIds?: string[];
}

export interface ConstraintAssertionEvaluator {
  engine: string;
  version: string;
  ruleId?: string;
}

export interface ConstraintAssertion {
  assertionId: string;
  constraintType: string;
  status: ConstraintEvaluationStatus;
  severity: ConstraintAssertionSeverity;
  scope: ConstraintAssertionScope;
  reasonCode: string;
  evidenceRefs: string[];
  message: string;
  remediationHints?: string[];
  evaluator: ConstraintAssertionEvaluator;
  /** When true, Decision Core may not override without explicit user consent */
  overridable?: boolean;
  confidence?: number;
}
