/**
 * P20 — Execution Physics: declarative semantics for time, causality, and state evolution (metadata layer).
 */

export type TimeSemanticsType =
  | 'LINEAR_TIME'
  | 'SEGMENTED_TIME'
  | 'RELATIVE_TIME'
  | 'CAUSAL_TIME';

export type DriftBehavior = 'ACCUMULATIVE' | 'RESET_ON_BRANCH' | 'CONTEXTUAL_REBASE';

export interface TimeSemantics {
  type: TimeSemanticsType;
  driftBehavior: DriftBehavior;
}

export type CausalitySemantics =
  | 'STRICT_CHAIN'
  | 'DAG_CAUSALITY'
  | 'PROBABILISTIC_CAUSALITY';

export interface StateTransitionRules {
  /** How superposed execution states collapse to observed posture. */
  defaultCollapse: 'EAGER' | 'DEFERRED' | 'EXTERNALIZED';
}

export type PhysicsConstraints =
  | 'STRICT_SEQUENTIAL'
  | 'PARTIAL_ORDER'
  | 'PROBABILISTIC_CAUSALITY'
  | 'MULTI_WORLD_BRANCHING';

export interface ExecutionPhysicsModel {
  version: string;
  timeModel: TimeSemantics;
  causalityModel: CausalitySemantics;
  stateTransitionModel: StateTransitionRules;
  constraints: PhysicsConstraints;
}

export interface PhysicsDriftSignal {
  kind: 'TIME_MODEL_MISMATCH' | 'CAUSALITY_VIOLATION' | 'STATE_COLLAPSE_INSTABILITY';
  severity: number;
  detail: string;
}

export interface CompiledExecutionPhysics {
  rewrittenTimeRules: Record<string, string | number | boolean>;
  rewrittenCausality: Record<string, string | number | boolean>;
  rewrittenStateRules: Record<string, string | number | boolean>;
}
