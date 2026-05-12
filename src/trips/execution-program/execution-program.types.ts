/**
 * P7 Execution Kernel Compiler — DAG → deterministic instruction stream.
 */

import type { ExecutionEdgeType, ExecutionTruthFinalState } from '../execution-truth-dag/execution-truth-dag.types';
import type { GraphPatchOp } from '../execution-truth-dag/build-graph-patches';

export type StateProjectDerive = 'delay' | 'reliability' | 'risk';

export type ExecutionInstruction =
  | {
      type: 'EXEC_CHECK';
      nodeId: string;
      /** Expected posture at compile time — interpreter re-validates against live DAG. */
      rule: ExecutionTruthFinalState;
    }
  | {
      type: 'EDGE_TRAVERSE';
      from: string;
      to: string;
      cost: number;
      edgeType?: ExecutionEdgeType;
    }
  | {
      type: 'EDGE_MUTATE';
      edgeId: string;
      op: GraphPatchOp;
    }
  | {
      type: 'STATE_PROJECT';
      nodeId: string;
      derive: StateProjectDerive;
    }
  | {
      type: 'BRANCH';
      condition: string;
      subProgram: ExecutionProgram;
    };

export interface ExecutionProgram {
  version: string;
  instructions: ExecutionInstruction[];
  /** First timeline node — deterministic rollout entry. */
  entrypoint: string;
  metadata: {
    deterministic: boolean;
    sources: readonly string[];
  };
}
