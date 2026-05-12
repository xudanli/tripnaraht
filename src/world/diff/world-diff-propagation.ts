/**
 * 传播语义由 `propagationHint` 驱动，而非按 domain 手写分叉（策略函数）
 */

import type { TripPlan } from '../../trips/decision/plan-model';
import { buildPartialReplanGraphFromPlan } from '../../trips/replan/build-partial-replan-graph';
import { extractImpactSubgraph } from '../../trips/replan/impact-subgraph.extractor';
import type { WorldDiff } from './world-diff.contract';

export interface PropagationContext {
  readonly plan?: TripPlan;
}

function allPlanSlotIds(plan: TripPlan): string[] {
  const ids: string[] = [];
  for (const d of plan.days) {
    for (const s of d.timeSlots) {
      ids.push(s.id);
    }
  }
  return ids;
}

/**
 * 在给定行程下展开「受影响槽位」闭包（LOCAL=仅声明；SEQUENCE=沿局部 replan 子图；GLOBAL=全日程）
 */
export function computePropagation(
  diff: WorldDiff,
  ctx: PropagationContext,
): readonly string[] {
  const seed = [...diff.impactedSlots];

  switch (diff.propagationHint) {
    case 'LOCAL':
      return [...new Set(seed)].sort();

    case 'GLOBAL': {
      if (!ctx.plan) {
        return [...new Set(seed)].sort();
      }
      return [...new Set(allPlanSlotIds(ctx.plan))].sort();
    }

    case 'SEQUENCE': {
      if (!ctx.plan || seed.length === 0) {
        return [...new Set(seed)].sort();
      }
      const graph = buildPartialReplanGraphFromPlan(ctx.plan);
      const subgraph = extractImpactSubgraph(graph, seed);
      const slotIds = subgraph.nodes
        .filter((n) => n.type === 'SLOT')
        .map((n) => n.id);
      return [...new Set([...seed, ...slotIds])].sort();
    }

    default: {
      const _e: never = diff.propagationHint;
      return _e;
    }
  }
}
