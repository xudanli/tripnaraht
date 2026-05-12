/**
 * Counterfactual: clone DAG and apply edge mutations (deterministic replay base).
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionGraphPatch } from '../execution-truth-dag/build-graph-patches';

const DEC_DELTA = 2.5;
const INC_DELTA = 2.5;

/** Deep-clone nodes/edges for immutable counterfactual runs. */
export function cloneExecutionTruthDAG(dag: ExecutionTruthDAG): ExecutionTruthDAG {
  return {
    nodes: dag.nodes.map(n => ({
      ...n,
      execution: { ...n.execution },
      temporal: { ...n.temporal },
      weather: { ...n.weather },
      road: { ...n.road },
      ...(n.repair ? { repair: { ...n.repair } } : {}),
    })),
    edges: dag.edges.map(e => ({
      ...e,
      ...(e.repairProposalIds ? { repairProposalIds: [...e.repairProposalIds] } : {}),
    })),
  };
}

export function applyGraphPatchesToDag(
  dag: ExecutionTruthDAG,
  patches: ExecutionGraphPatch[],
): ExecutionTruthDAG {
  if (!patches.length) {
    return cloneExecutionTruthDAG(dag);
  }

  const next = cloneExecutionTruthDAG(dag);
  const edges = [...next.edges];

  for (const p of patches) {
    const idx = edges.findIndex(e => e.id === p.target);
    if (idx < 0) {
      continue;
    }
    const cur = edges[idx]!;

    if (p.op === 'REMOVE') {
      edges.splice(idx, 1);
      continue;
    }

    if (p.op === 'DECREASE_WEIGHT') {
      edges[idx] = { ...cur, weight: Math.max(0, cur.weight - DEC_DELTA) };
    } else if (p.op === 'INCREASE_WEIGHT') {
      edges[idx] = { ...cur, weight: cur.weight + INC_DELTA };
    }
  }

  next.edges = edges;
  return next;
}
