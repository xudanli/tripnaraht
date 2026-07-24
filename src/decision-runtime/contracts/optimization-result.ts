/**
 * OptimizationResult — feasibility and termination are separate dimensions.
 * TIME_LIMIT + hasIncumbent → FEASIBLE, not INFEASIBLE.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { ObjectiveEvaluation } from './objective-definition';

export type FeasibilityStatus =
  | 'FEASIBLE'
  | 'RELAXED_FEASIBLE'
  | 'INFEASIBLE'
  | 'UNVERIFIED';

export type TerminationReason =
  | 'OPTIMAL'
  | 'FEASIBLE_NOT_PROVEN_OPTIMAL'
  | 'INFEASIBLE_PROVEN'
  | 'TIME_LIMIT'
  | 'ERROR';

/** What the solver actually optimizes — not POI combinatorial planning until native CP-SAT. */
export type OptimizationLevel = 'FULL_PLAN_CANDIDATE_SELECTION';

export type SolverFamily =
  | 'ENUMERATIVE_LEXICOGRAPHIC_SELECTION'
  | 'LEXICOGRAPHIC_RANK_FALLBACK'
  | 'DECISION_CORE_FINALIZE';

export interface SolverMetadata {
  strategyId: string;
  strategyVersion: string;
  solverEngine?: string;
  solverVersion?: string;
  /** Human-readable capability label (e.g. CP-SAT-compatible Lexicographic Candidate Selector) */
  displayName?: string;
  solverFamily?: SolverFamily;
  optimizationLevel?: OptimizationLevel;
  /** True only when bound to native OR-Tools / external CP-SAT service */
  nativeCpSat?: boolean;
  elapsedMs: number;
  seed?: number;
}

export interface OptimizationTraceStep {
  stepId: string;
  kind: string;
  at: string;
  detail?: Record<string, unknown>;
}

export interface OptimizationTrace {
  traceId: string;
  steps: OptimizationTraceStep[];
}

export interface StructuredExplanation {
  schemaId: 'tripnara.structured_explanation@v1';
  summary: string;
  tradeoffs?: Array<{ dimension: string; message: string; evidenceRefs?: string[] }>;
  warnings?: string[];
  verificationRequired?: string[];
}

export interface OptimizationResult {
  schemaId: 'tripnara.optimization_result@v1';
  problemId: string;
  tripId: string;
  snapshotId: string;

  feasibilityStatus: FeasibilityStatus;
  terminationReason: TerminationReason;

  hasIncumbent: boolean;
  candidates: DecisionCandidate[];
  recommendedCandidateId?: string;

  objectiveValue?: number;
  bestBound?: number;
  optimalityGap?: number;
  objectiveEvaluations?: ObjectiveEvaluation[];

  constraintReport: CanonicalConstraintReport;
  optimizationTrace: OptimizationTrace;
  solverMetadata: SolverMetadata;
  explanation: StructuredExplanation;
  humanDecisionRequired?: boolean;
  /** Set when strategy path invoked DecisionCore.finalize (legacy-frozen) */
  decisionRecord?: import('../../trips/guardian-decision-core/contracts/decision-record.types').Rfc001DecisionRecord;
}
