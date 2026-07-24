/**
 * RFC-002 Phase 2 — pack rule evaluation → constraint material (destination-agnostic).
 */

export type PackConstraintVerdict = 'PASS' | 'WARNING' | 'BLOCK' | 'UNKNOWN';

export interface PackRecoveryCondition {
  code: string;
  description: string;
  evidenceRefs: string[];
}

export interface PackConstraintEvaluation {
  matched: boolean;
  ruleId: string;
  semanticKey: string;
  verdict: PackConstraintVerdict;
  constraintCode: string;
  reasonCodes: string[];
  overridable: boolean;
  ruleVersion: string;
  recoveryConditions?: PackRecoveryCondition[];
}

export interface PackRuleConstraintInput {
  country: string;
  semanticKey: string;
  facts: Record<string, unknown>;
  candidateUsesRoute: boolean;
  /** Prefix for ruleVersion trace (e.g. abu-road-constraint-rfc001-0.2.0) */
  ruleVersionPrefix?: string;
}
