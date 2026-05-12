/**
 * P14 — Self-Stabilizing Execution OS: drift signals + stability scores (control plane, not optimization).
 */

export type StabilityDriftType =
  | 'CONSTRAINT_DRIFT'
  | 'IR_DETERMINISM_DRIFT'
  | 'DAG_STRUCTURE_DRIFT'
  | 'POLICY_BEHAVIOR_DRIFT'
  | 'NEPTUNE_DECISION_DRIFT';

export type StabilitySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StabilityDriftSignal {
  type: StabilityDriftType;
  severity: StabilitySeverity;
  dagId?: string;
  irId?: string;
  description: string;
  /** Penalty weight in [0,1], summed for global score reduction. */
  deltaScore: number;
}

export interface StabilityScore {
  global: number;
  dag: number;
  ir: number;
  policy: number;
  execution: number;
}

/** Anchor from a prior tick or external registry — enables temporal drift detection. */
export interface ExecutionStabilityBaseline {
  truthHash: string;
  irFingerprint: string;
  proofGlobalStatus?: import('../constraint-proof/constraint-proof.types').ConstraintProofGlobalStatus;
  neptuneTriggerCount?: number;
  policyId?: string;
}

export interface StabilityDetectionContext {
  baseline?: ExecutionStabilityBaseline;
  /** Precomputed proof — if omitted and `dag` is set, detectors may call `buildConstraintProof`. */
  proof?: import('../constraint-proof/constraint-proof.types').ExecutionConstraintProof;
  /** Current Neptune trigger count — use after repair to compare with baseline on next tick. */
  neptuneTriggerCount?: number;
  /** Expected static policy id when using P11 (e.g. `default-v1`). */
  executionPolicyId?: string;
}

export interface StabilityFixHandlers {
  repairConstraintRules?: () => void;
  recompileIR?: () => void;
  resetNeptunePolicyCache?: () => void;
  rebuildDAGIndex?: () => void;
}

export interface RunStabilityPlaneResult {
  signals: StabilityDriftSignal[];
  score: StabilityScore;
  /** True when fixes ran because global score fell below threshold. */
  fixesApplied: boolean;
}
