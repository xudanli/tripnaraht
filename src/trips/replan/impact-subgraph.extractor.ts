/**
 * 从受影响槽位沿 dependsOn 向上闭包，得到需一致重算的最小子图（MVP）
 */

import type { PartialReplanGraph, ReplanNode } from './partial-replan.graph';

export interface Subgraph {
  readonly nodes: ReplanNode[];
  /** 约束融合给出的初始受影响槽位 */
  readonly boundaryNodes: readonly string[];
}

export function extractImpactSubgraph(
  graph: PartialReplanGraph,
  affectedSlots: readonly string[],
): Subgraph {
  const visited = new Set<string>();
  const queue = [...affectedSlots].map((s) => String(s).trim()).filter(Boolean);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;

    visited.add(id);

    const node = graph.nodes.get(id);
    if (!node) continue;

    for (const dep of node.dependsOn) {
      queue.push(dep);
    }
  }

  const nodes: ReplanNode[] = [];
  for (const id of visited) {
    const n = graph.nodes.get(id);
    if (n) nodes.push(n);
  }

  return {
    nodes,
    boundaryNodes: [...affectedSlots],
  };
}
