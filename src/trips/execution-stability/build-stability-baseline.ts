import { buildConstraintProof } from '../constraint-proof/build-constraint-proof';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import { stableExecutionDagId } from '../execution-ir/stable-dag-id';
import { stableExecutionIrId } from '../execution-memory/stable-execution-ir-id';
import type { ExecutionStabilityBaseline } from './stability.types';

export function buildExecutionStabilityBaseline(input: {
  dag: ExecutionTruthDAG;
  ir: ExecutionIR;
  neptuneTriggerCount: number;
  policyId?: string;
  /** When false, skip proof read (saves a proof pass). */
  includeProofStatus?: boolean;
}): ExecutionStabilityBaseline {
  const proof =
    input.includeProofStatus === false
      ? undefined
      : buildConstraintProof(input.dag).globalStatus;

  return {
    truthHash: stableExecutionDagId(input.dag),
    irFingerprint: stableExecutionIrId(input.ir),
    proofGlobalStatus: proof,
    neptuneTriggerCount: input.neptuneTriggerCount,
    policyId: input.policyId,
  };
}
