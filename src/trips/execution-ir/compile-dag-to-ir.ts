import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { assertOnlyIRCompilerCanRun } from '../execution-truth-dag/dag-canonical-policy';
import { isExecutionTruthDAG } from '../execution-truth-dag/is-execution-truth-dag';
import type { ExecutionIR } from './execution-ir.types';
import { ExecutionIRSources } from './execution-ir.types';
import { stableExecutionDagId } from './stable-dag-id';

/** DAG → IR steps — **only** invoked from `compileDAGToIR`. */
export function buildSteps(dag: ExecutionTruthDAG): ExecutionIR['steps'] {
  const steps: ExecutionIR['steps'] = [];

  const nodes = [...dag.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...dag.edges].sort((a, b) => a.id.localeCompare(b.id));

  for (const node of nodes) {
    steps.push({ type: 'CHECK', nodeId: node.id });
    steps.push({ type: 'PROJECT', nodeId: node.id, metric: 'delay' });
    steps.push({ type: 'PROJECT', nodeId: node.id, metric: 'risk' });
    steps.push({ type: 'PROJECT', nodeId: node.id, metric: 'reliability' });
  }

  for (const edge of edges) {
    steps.push({
      type: 'TRAVERSE',
      edgeId: edge.id,
      cost: edge.weight ?? 0,
    });
  }

  return steps;
}

/**
 * **唯一** IR 构造入口 — Neptune / Repair / runtime 禁止调用除本文档外的 IR 拼装。
 */
export function compileDAGToIR(dag: ExecutionTruthDAG): ExecutionIR {
  if (!isExecutionTruthDAG(dag)) {
    throw new Error('[COMPILER] invalid DAG input');
  }
  assertOnlyIRCompilerCanRun(dag, 'compileDAGToIR');
  const steps = buildSteps(dag);
  const dagId = stableExecutionDagId(dag);
  return {
    version: '1',
    meta: {
      source: ExecutionIRSources.DAG_COMPILER,
      dagId,
      compiledAt: Date.now(),
      deterministic: true,
    },
    steps,
  };
}
