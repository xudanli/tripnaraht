/**
 * P13 — Execution Memory Graph: time-extended execution truth (replay / explain / counterfactuals).
 */

import type {
  ConstraintProofGlobalStatus,
  ExecutionConstraintProof,
} from '../constraint-proof/constraint-proof.types';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';

export type ExecutionMemoryEventType =
  | 'DAG_BUILT'
  | 'PROOF_EVALUATED'
  | 'IR_COMPILED'
  | 'SIMULATION_RUN'
  | 'NEPTUNE_DECISION'
  | 'REPAIR_APPLIED';

export interface ExecutionMemoryEvent {
  id: string;
  dagId: string;
  irId: string;
  timestamp: number;
  type: ExecutionMemoryEventType;
  /** Structured audit payload — narrow at producers; consumers validate shape. */
  payload: unknown;
}

export interface ExecutionMemorySnapshot {
  dagId: string;
  irId: string;
  overlayHash: string;
  /** Structural hash of DAG nodes/edges (same as `stableExecutionDagId` on `state.dag`). */
  truthHash: string;
  state: {
    dag: ExecutionTruthDAG;
    ir: ExecutionIR;
    overlay?: ExecutionOverlayFrame[];
    proof?: ExecutionConstraintProof;
  };
}

export interface ExecutionMemoryGraph {
  events: ExecutionMemoryEvent[];
  snapshots: ExecutionMemorySnapshot[];
}

/** Folded interpretable state after replaying events for one `dagId`. */
export interface ExecutionReplayState {
  dagId: string;
  eventTypesSeen: ExecutionMemoryEventType[];
  lastProofStatus?: ConstraintProofGlobalStatus;
  lastSimulationSummary?: Record<string, unknown>;
  lastNeptuneSummary?: Record<string, unknown>;
  repairApplied?: { changedSlotIds: string[] };
  rawEvents: ExecutionMemoryEvent[];
}
