/**
 * Explanation Synthesizer — 因果图 → 人类可读解释（审计 / UI / Neptune）
 */

import {
  buildCausalGraph,
  type BuildCausalGraphContext,
} from './causal-graph.builder';
import type { CausalGraph } from './causal-trace.model';
import type { CausalTraceNode } from './causal-trace.model';

export interface Explanation {
  readonly summary: string;
  readonly steps: readonly string[];
  readonly causalChain: readonly string[];
}

function stepLine(n: CausalTraceNode): string {
  switch (n.type) {
    case 'CONSTRAINT':
      return `Constraint detected (${n.reasonCode}): ${n.source} affects [${n.target}]`;
    case 'IMPACT':
      return `Impact routed to slot ${n.target} from ${n.source}`;
    case 'REPAIR':
      return `Repair applied on slot ${n.source}: action ${n.reasonCode} → ${n.target}`;
    case 'REPLAN':
      return `Partial replan adjusted slot ${n.target} (${n.reasonCode})`;
    case 'MUTATION':
      return `Semantic mutation: ${n.target} (${n.reasonCode})`;
  }
}

export function synthesizeExplanation(graph: CausalGraph): Explanation {
  const steps = graph.nodes.map((n) => stepLine(n));
  const summary =
    graph.nodes.length === 0
      ? 'No causal trace recorded for this execution snapshot.'
      : 'Itinerary adjusted due to real-world constraints and execution pipeline decisions.';

  return {
    summary,
    steps,
    causalChain: [...steps],
  };
}

/** 从单次编排上下文直接生成面向视图的 Explanation（builder / reducer 收口） */
export function buildExplanationFromContext(
  context: BuildCausalGraphContext,
): Explanation {
  return synthesizeExplanation(buildCausalGraph(context));
}
