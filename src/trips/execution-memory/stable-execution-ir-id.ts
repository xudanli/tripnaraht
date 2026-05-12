/**
 * Deterministic IR identity for memory / replay (same IR structure → same id).
 */

import { createHash } from 'crypto';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';

export function stableExecutionIrId(ir: ExecutionIR): string {
  const payload = JSON.stringify({
    v: ir.version,
    dagId: ir.meta.dagId,
    deterministic: ir.meta.deterministic,
    steps: ir.steps,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 24);
}
