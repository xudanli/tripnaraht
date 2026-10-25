import type { KnowledgeRelation } from '../contracts/knowledge-relation.types';
import type { KnowledgeGraphStats } from '../contracts/knowledge-graph-view.types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function countConnectedComponents(rels: KnowledgeRelation[]): number {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = adj.get(a) ?? [];
    list.push(b);
    adj.set(a, list);
  };
  for (const r of rels) {
    add(r.from, r.to);
    add(r.to, r.from);
  }
  const seen = new Set<string>();
  let components = 0;
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    components += 1;
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) stack.push(n);
      }
    }
  }
  return components;
}

export function weekDeltas(rels: KnowledgeRelation[], now = Date.now()): {
  nodeDeltaWeek: number;
  edgeDeltaWeek: number;
} {
  const weekAgo = now - WEEK_MS;
  const isNew = (r: KnowledgeRelation) => {
    if (!r.createdAt) return true;
    const t = Date.parse(r.createdAt);
    return Number.isNaN(t) || t >= weekAgo;
  };
  const newRels = rels.filter(isNew);
  const oldRels = rels.filter((r) => !isNew(r));
  const oldNodes = new Set(oldRels.flatMap((r) => [r.from, r.to]));
  const allNodes = new Set(rels.flatMap((r) => [r.from, r.to]));
  let nodeDeltaWeek = 0;
  for (const n of allNodes) {
    if (!oldNodes.has(n)) nodeDeltaWeek += 1;
  }
  return { nodeDeltaWeek, edgeDeltaWeek: newRels.length };
}

export function buildGraphStats(input: {
  viewNodeCount: number;
  viewEdgeCount: number;
  viewRels: KnowledgeRelation[];
  catalogRels: KnowledgeRelation[];
  lastUpdated?: string | null;
}): KnowledgeGraphStats {
  const week = weekDeltas(input.catalogRels);
  return {
    nodeCount: input.viewNodeCount,
    edgeCount: input.viewEdgeCount,
    nodeDeltaWeek: week.nodeDeltaWeek,
    edgeDeltaWeek: week.edgeDeltaWeek,
    subgraphCount: countConnectedComponents(input.viewRels),
    lastUpdated: input.lastUpdated ?? new Date().toISOString(),
  };
}
