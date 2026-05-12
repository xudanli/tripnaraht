/**
 * P-Next 6 — Graded semantic outcomes over field space (not boolean pass/fail).
 */

/** Aligns with execution invariant domains — duplicated here to avoid type cycles with proof types. */
export type SemanticEvaluationDomain =
  | 'TEMPORAL'
  | 'WEATHER'
  | 'ROUTE'
  | 'FUEL'
  | 'PHYSICS';

/** Per-domain semantic distance from ideal (0 = ideal, 1 = worst in profile). */
export interface SemanticEvaluation {
  domain: SemanticEvaluationDomain;
  /** Leg → contribution to domain distance (0–1 each). */
  byLegId: Record<string, number>;
  /** Scalar rollup for ordering / proof — deterministic mean of leg contributions. */
  aggregateDistance: number;
}

export interface SemanticViolation {
  domain: SemanticEvaluationDomain;
  legId: string;
  /** Degree of violation (0–1). */
  degree: number;
  /** Human-readable rule id for audits */
  ruleId: string;
}

export interface SemanticEvaluationResult {
  semanticsProfileId: string;
  semanticsVersion: string;
  evaluations: SemanticEvaluation[];
  violations: SemanticViolation[];
  /** Mean of per-domain aggregate distances — single “semantic mismatch” scalar. */
  semanticAggregateDistance: number;
}
