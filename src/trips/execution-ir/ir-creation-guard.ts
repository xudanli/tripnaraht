/**
 * P8-2-B IR Determinism Lock — **ExecutionIR** must originate only from `compileDAGToIR`.
 */

import type { ExecutionIR } from './execution-ir.types';
import { ExecutionIRSources } from './execution-ir.types';

export function assertIRCreatedOnlyByCompiler(
  ir: ExecutionIR | undefined,
  context: string,
): asserts ir is ExecutionIR {
  if (!ir?.steps?.length) {
    throw new Error(`[IR-LOCK] Missing ExecutionIR in ${context}`);
  }
  if (ir.meta.source !== ExecutionIRSources.DAG_COMPILER) {
    throw new Error(`[IR-LOCK] Invalid IR source in ${context}: ${ir.meta.source}`);
  }
  if (!ir.meta.dagId) {
    throw new Error(`[IR-LOCK] Missing dagId in ${context}`);
  }
  if (ir.meta.deterministic !== true) {
    throw new Error(`[IR-LOCK] deterministic flag invalid in ${context}`);
  }
  if (typeof ir.meta.compiledAt !== 'number' || !Number.isFinite(ir.meta.compiledAt)) {
    throw new Error(`[IR-LOCK] Missing compiledAt in ${context}`);
  }
}
