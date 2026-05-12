/**
 * P17 — Execution Multiverse: competing simulated worlds over one structural lineage.
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionIRRunResult } from '../execution-ir/execute-execution-ir';

export interface ExecutionWorld {
  worldId: string;
  dag: ExecutionTruthDAG;
  ir: ExecutionIR;
  /** Label for overlay lineage used when branching worlds (not necessarily distinct frames). */
  overlayVariant: string;
  probability: number;
  /** Drift vs baseline world — filled by {@link computeWorldDivergence}. */
  divergenceScore: number;
}

export interface WorldSimulationResult {
  worldId: string;
  irRun: ExecutionIRRunResult;
  /** Scalar burn — sum of P16-B resource dimensions. */
  cost: number;
  /** Economy utility ratio (P16-B). */
  utility: number;
  divergenceScore: number;
}
