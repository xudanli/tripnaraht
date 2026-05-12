import { buildConstraintProof } from '../constraint-proof/build-constraint-proof';
import type { ExecutionConstraintProof } from '../constraint-proof/constraint-proof.types';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { executeExecutionIR } from '../execution-ir/execute-execution-ir';
import type { ExecutionIRRunResult } from '../execution-ir/execute-execution-ir';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';

export type ExecutionTruthDagMutation = (dag: ExecutionTruthDAG) => ExecutionTruthDAG;

export type CounterfactualExecutionResult =
  | { feasible: false; proof: ExecutionConstraintProof }
  | {
      feasible: true;
      proof: ExecutionConstraintProof;
      ir: import('../execution-ir/execution-ir.types').ExecutionIR;
      result: ExecutionIRRunResult;
    };

export function runCounterfactual(
  dag: ExecutionTruthDAG,
  mutation: ExecutionTruthDagMutation,
): CounterfactualExecutionResult {
  const modifiedDag = mutation(dag);
  const proof = buildConstraintProof(modifiedDag);

  if (proof.globalStatus === 'INFEASIBLE') {
    return { feasible: false, proof };
  }

  const ir = compileDAGToIR(modifiedDag);
  const result = executeExecutionIR(ir, modifiedDag);

  return {
    feasible: true,
    proof,
    ir,
    result,
  };
}
