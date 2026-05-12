/**
 * Compiles ExecutionTruthDAG (+ optional repair patches) → linear ExecutionProgram.
 */

import type { ExecutionGraphPatch } from '../execution-truth-dag/build-graph-patches';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { orderedTraversalIds } from '../execution-runtime/build-execution-runtime';
import type { ExecutionInstruction, ExecutionProgram } from './execution-program.types';

export const EXECUTION_PROGRAM_VERSION = '1' as const;

export interface BuildExecutionProgramOptions {
  /** Repair-derived patches appended as EDGE_MUTATE tail. */
  patches?: ExecutionGraphPatch[];
}

/**
 * Topological linearization: nodes (checks + projections) → edges (traverse) → optional mutations.
 */
export function buildExecutionProgram(
  dag: ExecutionTruthDAG,
  options?: BuildExecutionProgramOptions,
): ExecutionProgram {
  const nodeOrder = orderedTraversalIds(dag);
  const instructions: ExecutionInstruction[] = [];

  for (const nid of nodeOrder) {
    const node = dag.nodes.find(n => n.id === nid);
    if (!node) {
      continue;
    }

    instructions.push({
      type: 'EXEC_CHECK',
      nodeId: nid,
      rule: node.execution.finalState,
    });

    instructions.push({ type: 'STATE_PROJECT', nodeId: nid, derive: 'delay' });
    instructions.push({ type: 'STATE_PROJECT', nodeId: nid, derive: 'reliability' });
    instructions.push({ type: 'STATE_PROJECT', nodeId: nid, derive: 'risk' });
  }

  const edgesSorted = [...dag.edges].sort((a, b) => a.id.localeCompare(b.id));
  for (const e of edgesSorted) {
    instructions.push({
      type: 'EDGE_TRAVERSE',
      from: e.from,
      to: e.to,
      cost: e.weight,
      edgeType: e.type,
    });
  }

  if (options?.patches?.length) {
    const sortedPatches = [...options.patches].sort((a, b) =>
      a.target.localeCompare(b.target),
    );
    for (const p of sortedPatches) {
      instructions.push({
        type: 'EDGE_MUTATE',
        edgeId: p.target,
        op: p.op,
      });
    }
  }

  return {
    version: EXECUTION_PROGRAM_VERSION,
    instructions,
    entrypoint: nodeOrder[0] ?? '',
    metadata: {
      deterministic: true,
      sources: ['overlay', 'dag'],
    },
  };
}
