import type { OrchestrationGraphEdge, OrchestrationNodeId } from '../orchestration-graph.types';

/** pre_plan + post_plan 主链静态边（条件短路由节点返回 terminal / 显式 next） */
export const MAIN_CHAIN_STATIC_EDGES: OrchestrationGraphEdge[] = [
  { from: 'intake', to: 'state_update', reason: 'happy_path' },
  { from: 'state_update', to: 'research', reason: 'happy_path' },
  { from: 'research', to: 'poi_selection', reason: 'happy_path' },
  { from: 'poi_selection', to: 'gate_eval', reason: 'happy_path' },
  { from: 'gate_eval', to: 'context_build', reason: 'happy_path' },
  { from: 'context_build', to: 'plan_gen', reason: 'happy_path' },
  { from: 'plan_gen', to: 'optimize', reason: 'plan_verify_loop_entry' },
  { from: 'narrate', to: 'feedback', reason: 'post_plan' },
  { from: 'feedback', to: 'hallucination', reason: 'post_plan' },
  { from: 'hallucination', to: 'END', reason: 'post_plan_done' },
];

const NEXT_BY_FROM = new Map<OrchestrationNodeId, OrchestrationNodeId | 'END'>(
  MAIN_CHAIN_STATIC_EDGES.map((e) => [e.from, e.to]),
);

export function resolveMainChainNext(from: OrchestrationNodeId): OrchestrationNodeId | 'END' | undefined {
  return NEXT_BY_FROM.get(from);
}
