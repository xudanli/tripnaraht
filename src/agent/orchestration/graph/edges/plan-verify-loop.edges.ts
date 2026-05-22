import type { OrchestrationGraphEdge, OrchestrationNodeId } from '../orchestration-graph.types';

/**
 * plan_verify_loop 子图边表（§3.3 目标态 + 当前 run 内语义）。
 * 调度器在节点未返回显式 next 时按此表前进。
 */
export const PLAN_VERIFY_LOOP_EDGES: OrchestrationGraphEdge[] = [
  { from: 'optimize', to: 'verify', reason: 'happy_path' },
  { from: 'verify', to: 'repair', reason: 'repair_triggered' },
  { from: 'verify', to: 'research', reason: 'RETURN_TO_RESEARCH' },
  // { from: 'verify', to: 'plan_gen', reason: 'RETRY' },
  { from: 'repair', to: 'END', reason: 'repair_done_same_run' },
];

export type PlanVerifyLoopEdgeReason =
  | 'happy_path'
  | 'verify_pass_no_repair'
  | 'verify_fatal'
  | 'repair_triggered'
  | 'repair_utility_decay'
  | 'repair_count_exceeded'
  | 'RETURN_TO_RESEARCH'
  | 'RETRY';

const NEXT_BY_FROM = new Map<OrchestrationNodeId, OrchestrationNodeId | 'END'>(
  PLAN_VERIFY_LOOP_EDGES.map((e) => [e.from, e.to]),
);

export function resolvePlanVerifyLoopNext(
  from: OrchestrationNodeId,
): OrchestrationNodeId | 'END' | undefined {
  return NEXT_BY_FROM.get(from);
}

export const PLAN_VERIFY_LOOP_ENTRY: OrchestrationNodeId = 'optimize';
