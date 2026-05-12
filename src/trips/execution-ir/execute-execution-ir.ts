/**
 * Thin IR interpreter — delegates to P9 bytecode VM for deterministic semantics.
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { runExecutionIRAsVm } from '../execution-vm/execution-vm';
import type { ExecutionIR } from './execution-ir.types';

export interface ExecutionIRRunResult {
  ok: boolean;
  pathCost: number;
  failures: string[];
}

export function executeExecutionIR(ir: ExecutionIR, dag?: ExecutionTruthDAG): ExecutionIRRunResult {
  return runExecutionIRAsVm(ir, { witnessDag: dag }).irRun;
}
