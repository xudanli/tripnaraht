/**
 * P9 — machine-level bytecode derived from frozen ExecutionIR (provable execution layer).
 */

import type { ExecutionIRMetric, ExecutionIRPatchOp } from '../execution-ir/execution-ir.types';

export type ExecutionOpCode =
  | 'CHECK'
  | 'PROJECT'
  | 'TRAVERSE'
  | 'PATCH'
  | 'JUMP'
  | 'HALT';

/** Typed payloads — no `any`; extend only with version bumps. */
export type ExecutionBytecodeArgs =
  | { kind: 'CHECK'; nodeId: string }
  | { kind: 'PROJECT'; nodeId: string; metric: ExecutionIRMetric }
  | { kind: 'TRAVERSE'; edgeId: string; cost: number }
  | { kind: 'PATCH'; edgeId: string; op: ExecutionIRPatchOp }
  | { kind: 'JUMP'; offset: number }
  | { kind: 'HALT' };

export interface ExecutionBytecodeInstruction {
  op: ExecutionOpCode;
  args: ExecutionBytecodeArgs;
  /** Stable id for audit correlation — derived from IR step content only. */
  traceId: string;
}

export interface ExecutionBytecodeProgram {
  version: '1';
  dagId: string;
  instructions: ExecutionBytecodeInstruction[];
}
