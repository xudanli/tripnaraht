/**
 * Causal Decision Tuple — core data unit for the causal travel runtime flywheel.
 */

import type { TripIntervention } from './trip-intervention.types';

export const CAUSAL_DECISION_TUPLE_SCHEMA_V1 = 'tripnara/causal-decision-tuple/v1' as const;

/** Compact world-state pointer at decision time (not full TripWorldState). */
export interface CausalDecisionContextSnapshot {
  schema: typeof CAUSAL_DECISION_TUPLE_SCHEMA_V1;
  causality_id: string;
  trip_id?: string;
  trace_request_id?: string;
  snapshot_id?: string;
  region?: string;
  destination?: string;
  tick_kind: 'generate_plan' | 'repair_plan';
  recorded_at: string;
}

export interface CausalFailureHypothesis {
  failureMode: string;
  /** Ordered causal chain labels, e.g. wind → ETA → miss_prob. */
  causalChain: string[];
  confidence: number;
  evidenceTier?: 'verified_mechanism' | 'expert_rule' | 'statistical_correlation' | 'hypothesis_unverified';
}

export interface CausalExpectedOutcome {
  metrics: Record<string, number>;
  narrative?: string;
}

export interface CausalActualOutcome {
  metrics: Record<string, number>;
  narrative?: string;
  /** Mechanism ids or labels supported or refuted by observation. */
  mechanismEvidence?: string[];
}

/**
 * Causal Decision Tuple — join key for decision_logs, travel_events, decision_outcomes.
 */
export interface CausalDecisionTuple {
  schema: typeof CAUSAL_DECISION_TUPLE_SCHEMA_V1;
  context: CausalDecisionContextSnapshot;
  hypothesis?: CausalFailureHypothesis;
  alternatives: TripIntervention[];
  chosenIntervention?: TripIntervention;
  expectedOutcome?: CausalExpectedOutcome;
  actualOutcome?: CausalActualOutcome;
  confidenceBefore?: number;
  confidenceAfter?: number;
}
