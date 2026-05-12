import { stableExecutionDagId } from '../execution-ir/stable-dag-id';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import type { ExecutionConstraintProof } from '../constraint-proof/constraint-proof.types';
import type { ExecutionMemorySnapshot } from './execution-memory.types';
import { hashExecutionOverlayFrames } from './hash-canonical';
import { stableExecutionIrId } from './stable-execution-ir-id';

export interface BuildExecutionSnapshotContext {
  dag: ExecutionTruthDAG;
  ir: ExecutionIR;
  overlay?: ExecutionOverlayFrame[];
  proof?: ExecutionConstraintProof;
}

export function buildExecutionSnapshot(ctx: BuildExecutionSnapshotContext): ExecutionMemorySnapshot {
  const truthHash = stableExecutionDagId(ctx.dag);
  const irId = stableExecutionIrId(ctx.ir);
  const dagId = ctx.ir.meta.dagId;

  return {
    dagId,
    irId,
    overlayHash: hashExecutionOverlayFrames(ctx.overlay),
    truthHash,
    state: {
      dag: ctx.dag,
      ir: ctx.ir,
      overlay: ctx.overlay,
      proof: ctx.proof,
    },
  };
}
