/**
 * 沿 unifiedConstraintGraph 从锚点槽位 BFS 展开受影响 temporal 子图（v1）。
 */

import type { ISODate } from '../world-model';
import type { UnifiedConstraintGraphSnapshot } from '../constraint-graph/unified-constraint-graph.types';
import { slotNodeId } from '../constraint-graph/build-unified-constraint-graph';
import type { AffectedTemporalSubgraph } from './affected-subgraph.stub';

export interface ResolveAffectedTemporalSubgraphInput {
  graph?: UnifiedConstraintGraphSnapshot;
  anchor: {
    dates: ISODate[];
    seedSlotIds?: string[];
  };
}

/**
 * 从 seed 槽位沿统一约束图的有向边展开；若无图则退回锚点日期/槽位。
 */
export function resolveAffectedTemporalSubgraph(
  input: ResolveAffectedTemporalSubgraphInput,
): AffectedTemporalSubgraph {
  const { graph, anchor } = input;
  const seedSlotIds = anchor.seedSlotIds ?? [];
  const dates = new Set<ISODate>(anchor.dates);
  const slotIds = new Set<string>(seedSlotIds);

  if (!graph?.edges?.length || (!seedSlotIds.length && !anchor.dates.length)) {
    return {
      dates: [...dates],
      slotIds: [...slotIds],
    };
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = adj.get(e.fromNodeId) ?? [];
    list.push(e.toNodeId);
    adj.set(e.fromNodeId, list);
    const rev = adj.get(e.toNodeId) ?? [];
    rev.push(e.fromNodeId);
    adj.set(e.toNodeId, rev);
  }

  const seeds: string[] = [];
  if (seedSlotIds.length) {
    for (const sid of seedSlotIds) {
      for (const d of anchor.dates.length ? anchor.dates : graph.nodes.map((n) => n.date).filter(Boolean) as ISODate[]) {
        seeds.push(slotNodeId(d, sid));
      }
    }
  } else {
    for (const d of anchor.dates) {
      for (const n of graph.nodes) {
        if (n.kind === 'PLAN_SLOT' && n.date === d && n.slotId) {
          seeds.push(n.id);
        }
      }
    }
  }

  const visited = new Set<string>();
  const queue = [...new Set(seeds.filter((id) => nodeById.has(id)))];

  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const node = nodeById.get(cur);
    if (node?.date) dates.add(node.date);
    if (node?.slotId) slotIds.add(node.slotId);

    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return {
    dates: [...dates],
    slotIds: [...slotIds],
  };
}
