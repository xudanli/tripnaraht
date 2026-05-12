/**
 * P25 — Post-system equilibrium: no controller variable; stable dynamics from constraints + locality only.
 */

/** Agent trajectory state without IR/DAG/VM — pure field coordinates + local strain. */
export interface AgentState {
  id: string;
  /** Position in environment coordinate space (same dimensionality as bounds). */
  position: number[];
  /** Local deviation from constraint satisfaction [0, 1]. */
  stress: number;
}

export interface EnvironmentBounds {
  min: number[];
  max: number[];
}

export interface EnvironmentState {
  tick: number;
  bounds: EnvironmentBounds;
}

/** Global relaxation parameters — the only “law” left after execution artifacts are gone. */
export interface ConstraintField {
  /** Step multiplier toward constraint manifold [0, 1]. */
  relaxationRate: number;
  maxDisplacementPerStep: number;
}

export interface StableFlow {
  agentIds: string[];
  stabilityScore: number;
  selfMaintaining: boolean;
}

export interface EmergencePattern {
  type: 'natural_policy';
  stability: number;
}

export interface PostSystemField {
  agents: AgentState[];
  environment: EnvironmentState;
  constraintField: ConstraintField;
  emergencePatterns: EmergencePattern[];
}
