/**
 * Reality Policy Engine — unified verdicts for Reality-Constrained Execution.
 * Single convergence point: ALLOW | DEGRADE | BLOCK (not per-adapter ad hoc rules).
 */

import type { SnapshotValidityStatus } from './reality-snapshot.types';

/** Unified policy outcome for planning ticks and adapter ingress. */
export type RealityPolicyVerdict = 'ALLOW' | 'DEGRADE' | 'BLOCK';

/** Machine-readable policy outcome codes (stable for audit / metrics). */
export type RealityPolicyCode =
  | 'BOUNDARY_DISABLED'
  | 'SNAPSHOT_VALID'
  | 'SNAPSHOT_STALE'
  | 'SNAPSHOT_INVALIDATED'
  | 'NO_BOUND_CONTEXT'
  | 'LIVE_OVERRIDE'
  | 'SNAPSHOT_ONLY_NO_CTX'
  | 'SNAPSHOT_ONLY_INVALIDATED'
  | 'BYPASS_WARN'
  | 'BYPASS_ERROR'
  | 'BYPASS_BLOCK'
  /** Soft-world (RAG) retrieval blocked — missing bound DecisionContext when enforcement is on */
  | 'RAG_CONTEXT_REQUIRED';

/** What execution may do after policy evaluation (P0.5 execution contract). */
export interface RealityExecutionContractFlagsV0 {
  /** Planning / repair may continue (possibly in degraded mode). */
  allowContinuePlanning: boolean;
  /** Plan quality / confidence should be treated as degraded (e.g. STALE snapshot). */
  degradePlan: boolean;
  /** Caller must not treat outcome as executable without replan / refresh. */
  requireReplan: boolean;
  /** Live world reads should not be performed (ingress BLOCK). */
  blockLiveWorldRead: boolean;
}

export interface RealityPolicyEvaluateResult {
  verdict: RealityPolicyVerdict;
  codes: RealityPolicyCode[];
  reasons: string[];
  execution: RealityExecutionContractFlagsV0;
  /** Validity when bound context present (audit). */
  validityStatus?: SnapshotValidityStatus;
}

/** Persisted on `TripWorldState.signals` for this planning tick (causality / API). */
export interface RealityExecutionContractSnapshotV0 {
  verdict: RealityPolicyVerdict;
  snapshot_id?: string;
  policy_codes: RealityPolicyCode[];
  reasons: string[];
  evaluated_at: string;
  execution: RealityExecutionContractFlagsV0;
}

/** Append-only causality events (P1 — execution trace). */
export type RealityExecutionTraceKind =
  | 'planning_policy'
  | 'world_read_policy'
  | 'bypass';

export interface RealityExecutionTraceEventV0 {
  at: string;
  kind: RealityExecutionTraceKind;
  verdict?: RealityPolicyVerdict;
  snapshot_id?: string;
  codes?: RealityPolicyCode[];
  component?: string;
  detail?: string;
}
