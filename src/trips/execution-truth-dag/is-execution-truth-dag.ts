import type { ExecutionTruthDAG } from './execution-truth-dag.types';

/** P8-3：编译器入口运行时校验 —— 禁止非 DAG 对象冒充 ExecutionTruthDAG。 */
export function isExecutionTruthDAG(dag: unknown): dag is ExecutionTruthDAG {
  if (!dag || typeof dag !== 'object') {
    return false;
  }
  const d = dag as Record<string, unknown>;
  return Array.isArray(d.nodes) && Array.isArray(d.edges);
}
