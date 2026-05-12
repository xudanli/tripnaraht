/**
 * P6 Execution Runtime Kernel — replayable world state over ExecutionTruthDAG.
 */

import type {
  ExecutionEdge,
  ExecutionNode,
  ExecutionTruthDAG,
} from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionGraphPatch } from '../execution-truth-dag/build-graph-patches';

export interface DerivedExecutionState {
  totalDelay: number;
  blockedSlots: string[];
  /** Mean weather exposure on active nodes (0–1). */
  riskExposure: number;
  /** Reliability scores in rollout order (forecast / audit curve). */
  reliabilityCurve: number[];
}

export interface ExecutionWorldState {
  activeNodes: ExecutionNode[];
  activeEdges: ExecutionEdge[];
  derivedState: DerivedExecutionState;
}

export interface ExecutionSnapshot {
  timestamp: string;
  /** Monotonic step in forward rollout (0 = no nodes activated yet). */
  stepIndex: number;
  dag: ExecutionTruthDAG;
  state: ExecutionWorldState;
}

export interface BuildExecutionRuntimeInput {
  dag: ExecutionTruthDAG;
  /** Node ids in rollout order; default — sorted by `date` then `id`. */
  nodeOrder?: string[];
}

/** P6 repair contract: structural mutations + optional simulate-before-apply. */
export interface GraphMutationProgram {
  patches: ExecutionGraphPatch[];
  simulateBeforeApply: boolean;
}
