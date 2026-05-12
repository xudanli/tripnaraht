import { createHash } from 'crypto';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';

/** Deterministic id: same DAG structure → same dagId (for IR identity / replay). */
export function stableExecutionDagId(dag: ExecutionTruthDAG): string {
  const nodeSig = [...dag.nodes]
    .map(n => n.id)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  const edgeSig = [...dag.edges]
    .map(e => `${e.id}:${e.from}->${e.to}:${e.weight}:${e.type}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  const payload = `${nodeSig}#${edgeSig}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 24);
}
