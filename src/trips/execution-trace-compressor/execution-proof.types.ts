/**
 * P-Next 5 / P-Next 6 — Compressed execution proof + optional semantic-grade evaluations.
 */

import type { UnifiedPhysicsDerivedState } from '../physics/unified-physics-field.types';
import type {
  SemanticEvaluation,
  SemanticViolation,
} from '../execution-semantics/semantic-evaluation.types';
import type {
  CausalGraph,
  CausalIntervention,
  StateTrajectoryStep,
} from '../causal-physics/causal-graph.types';
import type { CausalModel, ModelPatch } from '../causal-reflection/causal-model.types';

export const EXECUTION_PROOF_SCHEMA_VERSION = 'p-next-5/v1' as const;

export type TraceSegmentKind =
  | 'PHYSICS_DIGEST'
  | 'OVERLAY_DIGEST'
  | 'DAG_DIGEST'
  | 'IR_DIGEST'
  | 'VM_DIGEST'
  | 'DECISION_DIGEST';

export interface TraceSegment {
  kind: TraceSegmentKind;
  /** Human-readable segment title for audit UIs */
  label: string;
  /** sha256 hex (64 chars) over canonical segment payload */
  payloadHash: string;
}

/** Minimal deterministic witnesses embedded for offline `verifyExecutionProof`. */
export interface ExecutionProofWitness {
  schemaVersion: typeof EXECUTION_PROOF_SCHEMA_VERSION;
  physicsByLegId: Record<
    string,
    {
      derived: UnifiedPhysicsDerivedState;
      mobility: number;
      exposure: number;
      energy: number;
      temporalPressure: number;
    }
  >;
  /** Sorted leg ids — audit aid; commitment uses {@link overlayContentHash}. */
  overlayLegIdsSorted: string[];
  /** Full sha256 over canonical sorted overlay frames JSON (matches compressor root). */
  overlayContentHash: string;
  dagSummary: { nodeCount: number; edgeCount: number };
  irSummary: { stepCount: number; dagId: string };
  vmSummary: { traceSteps: number; pathCost: number; ok: boolean };
  decisionSummary: { triggerCodesSorted: string[]; changedSlotIdsSorted: string[] };
  /** P-Next 6 — minimal overlay replay hints for semantic evaluation (optional). */
  semanticOverlayHints?: {
    daylightViolationLegIds: string[];
  };
}

export interface ExecutionProof {
  /** Commitment over physics + overlay roots (hex64). */
  rootStateHash: string;
  /** Commitment over merged Neptune decision surface (hex64). */
  decisionHash: string;
  compressedTrace: TraceSegment[];
  /** Invariant ids asserted at proof construction time */
  invariants: string[];
  witness: ExecutionProofWitness;
  /** P-Next 6 — DSL version bound into this proof (distinct from witness.schemaVersion). */
  semanticsVersion?: string;
  semanticsProfileId?: string;
  evaluations?: SemanticEvaluation[];
  violations?: SemanticViolation[];
  semanticAggregateDistance?: number;

  /** P-Next 7 — Cross-replica spread of semantic distances (same cohort). */
  semanticVariance?: number;
  /** P-Next 7 — Mean absolute divergence from winning replica’s semantic distance. */
  consensusDistance?: number;
  /** P-Next 7 — 0–1 agreement proxy (higher = replicas cluster in semantic space). */
  replicaAgreementScore?: number;
  /** P-Next 7 — cohort deemed stable under variance + agreement gates. */
  stableDecision?: boolean;

  /** P-Next 8 — Branch selected after counterfactual semantic optimization. */
  chosenBranchId?: string;
  /** P-Next 8 — Other branch ids ranked by semantic distance. */
  alternativeBranches?: string[];
  /** P-Next 8 — Per-world regret vs best semantic distance (aligned with evaluation order). */
  regretDistribution?: number[];
  /** P-Next 8 — Tightness of stability scores across branches (higher = more robust). */
  robustnessScore?: number;

  /** P-Next 9 — Chosen `do(·)` bundle + causal graph trajectory. */
  interventionSet?: CausalIntervention[];
  causalGraphBefore?: CausalGraph;
  causalGraphAfter?: CausalGraph;
  outcomeTrajectory?: StateTrajectoryStep[];
  /** P-Next 9 — Utility after planned interventions on causal graph. */
  utilityScore?: number;

  /** P-Next 10 — Reflective causal hypothesis before / after self-update. */
  causalModelBefore?: CausalModel;
  causalModelAfter?: CausalModel;
  modelRevisions?: ModelPatch[];
  /** P-Next 10 — Combined drift magnitude (0–1). */
  driftScore?: number;
  /** P-Next 10 — 1 − drift composite (higher = worldview stable). */
  stabilityScore?: number;
}
