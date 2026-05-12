import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';

export function cloneExecutionTruthDAG(dag: ExecutionTruthDAG): ExecutionTruthDAG {
  return {
    nodes: dag.nodes.map(n => ({
      ...n,
      execution: { ...n.execution },
      temporal: { ...n.temporal },
      weather: { ...n.weather },
      road: { ...n.road },
      repair: n.repair ? { ...n.repair } : undefined,
    })),
    edges: dag.edges.map(e => ({ ...e })),
  };
}

/**
 * Deterministic fork — seed 0 is exact clone.
 * seed &gt; 0 adds a unique structural edge + delay bump so {@link stableExecutionDagId} / IR diverge (observable multiverse).
 */
export function mutateDag(dag: ExecutionTruthDAG, seed: number): ExecutionTruthDAG {
  const next = cloneExecutionTruthDAG(dag);
  if (seed === 0 || !next.nodes.length) {
    return next;
  }

  const bump = (seed % 6) + 1;
  const head = next.nodes[0]!;
  next.nodes[0] = {
    ...head,
    execution: {
      ...head.execution,
      delayMinutes: head.execution.delayMinutes + bump,
    },
  };

  const nid = head.id;
  next.edges.push({
    id: `MULTIVERSE_BRANCH#${seed}`,
    from: nid,
    to: nid,
    type: 'ROUTE_DEPENDENCY',
    weight: seed * 0.02,
  });

  return next;
}
