export type AxiomSeverity = 'P0' | 'P1' | 'P2';

export interface AxiomUtilityAnchor {
  /** Expected penalty from simulation side (negative number). */
  expected_penalty: number;
  /** Actual penalty from real side (negative number). */
  actual_penalty: number;
  /** Allowed absolute difference between expected and actual. */
  tolerance: number;
}

export interface AxiomSchema {
  axiom_id: string;
  /** Constraint id used for dominant_cid attribution and L3 evidence. */
  cid: string;
  /** Label that should appear in simulated reasons set. */
  sim_label: string;
  /** Label that should appear in real reasons set. */
  real_label: string;
  severity: AxiomSeverity;
  /** Evidence fields required to consider this axiom “proof-carrying”. */
  evidence_schema: string[];
  utility_anchor: AxiomUtilityAnchor;
}

export type AxiomId = 'TERRAIN_F_ROAD_UNFIT' | 'FATIGUE_OVERLOAD' | 'ETA_INFEASIBLE';

