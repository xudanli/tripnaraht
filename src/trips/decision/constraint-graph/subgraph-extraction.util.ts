/**
 * 全局常驻图 → 约束子图提取（纯函数 BFS；Phase 2 可换 Neo4j）。
 */

import type {
  GlobalGraphEdge,
  GlobalGraphNode,
  GlobalSpatiotemporalGraphSnapshot,
  SubgraphExtractionQuery,
  SubgraphExtractionResult,
} from './global-spatiotemporal-graph.types';
import { GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1 } from './global-spatiotemporal-graph.types';

function isNodeValidForMonth(node: GlobalGraphNode, month: number): boolean {
  const months = node.validity?.openMonths;
  if (!months?.length) return true;
  return months.includes(month);
}

function isEdgeTraversable(
  edge: GlobalGraphEdge,
  month: number,
  closedEdgeIds: Set<string>,
  closedNodeIds: Set<string>,
): boolean {
  if (closedEdgeIds.has(edge.id)) return false;
  if (closedNodeIds.has(edge.fromNodeId) || closedNodeIds.has(edge.toNodeId)) return false;
  const months = edge.validity?.openMonths;
  if (months?.length && !months.includes(month)) return false;
  return true;
}

function passesCapabilityGate(node: GlobalGraphNode, query: SubgraphExtractionQuery): boolean {
  const props = node.properties;
  const slope = Number(props.maxSlopePct);
  if (query.maxSlopePct !== undefined && Number.isFinite(slope) && slope > query.maxSlopePct) {
    return false;
  }
  if (props.requires4x4 === true && query.vehicleType === '2WD') return false;
  return true;
}

export function extractConstrainedSubgraph(
  globalGraph: GlobalSpatiotemporalGraphSnapshot,
  query: SubgraphExtractionQuery,
): SubgraphExtractionResult {
  const maxNodes = query.maxNodes ?? 500;
  const maxHops = query.maxHops ?? 12;
  const closedEdgeIds = new Set(query.perturbation?.closedEdgeIds ?? []);
  const closedNodeIds = new Set([
    ...(query.excludeNodeIds ?? []),
    ...(query.perturbation?.closedNodeIds ?? []),
  ]);
  const edgeDelay = query.perturbation?.edgeDelayMinutes ?? {};

  const nodeById = new Map(globalGraph.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, GlobalGraphEdge[]>();
  for (const edge of globalGraph.edges) {
    const list = adjacency.get(edge.fromNodeId) ?? [];
    list.push(edge);
    adjacency.set(edge.fromNodeId, list);
    const rev = adjacency.get(edge.toNodeId) ?? [];
    rev.push({ ...edge, fromNodeId: edge.toNodeId, toNodeId: edge.fromNodeId });
    adjacency.set(edge.toNodeId, rev);
  }

  const prunedNodeIds: string[] = [];
  const visitedNodes = new Map<string, GlobalGraphNode>();
  const visitedEdges = new Map<string, GlobalGraphEdge>();
  const cascadeDelayHints: SubgraphExtractionResult['cascadeDelayHints'] = [];

  const seeds = query.anchorNodeIds.filter((id) => nodeById.has(id));
  const queue: Array<{ nodeId: string; hop: number }> = [];

  for (const seed of seeds) {
    const node = nodeById.get(seed)!;
    if (!isNodeValidForMonth(node, query.month) || !passesCapabilityGate(node, query)) {
      if (!prunedNodeIds.includes(seed)) prunedNodeIds.push(seed);
      continue;
    }
    visitedNodes.set(seed, node);
    queue.push({ nodeId: seed, hop: 0 });
  }

  while (queue.length > 0 && visitedNodes.size < maxNodes) {
    const { nodeId, hop } = queue.shift()!;
    if (hop >= maxHops) continue;

    for (const edge of adjacency.get(nodeId) ?? []) {
      if (!isEdgeTraversable(edge, query.month, closedEdgeIds, closedNodeIds)) continue;

      const neighborId = edge.toNodeId === nodeId ? edge.fromNodeId : edge.toNodeId;
      const neighbor = nodeById.get(neighborId);
      if (!neighbor) continue;

      if (!isNodeValidForMonth(neighbor, query.month) || !passesCapabilityGate(neighbor, query)) {
        if (!prunedNodeIds.includes(neighborId)) prunedNodeIds.push(neighborId);
        continue;
      }

      if (!visitedEdges.has(edge.id)) {
        visitedEdges.set(edge.id, edge);
        const delay = edgeDelay[edge.id];
        if (delay && delay > 0) {
          cascadeDelayHints.push({ edgeId: edge.id, deltaMinutes: delay, cause: 'PERTURBATION_EDGE_DELAY' });
        }
      }

      if (!visitedNodes.has(neighborId)) {
        visitedNodes.set(neighborId, neighbor);
        queue.push({ nodeId: neighborId, hop: hop + 1 });
      }
    }
  }

  const nodes = Array.from(visitedNodes.values());
  const edges = Array.from(visitedEdges.values());

  return {
    subgraph: {
      schemaVersion: GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1,
      countryCode: query.countryCode,
      emittedAt: new Date().toISOString(),
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        byKind: nodes.reduce(
          (acc, n) => {
            acc[n.kind] = (acc[n.kind] ?? 0) + 1;
            return acc;
          },
          {} as SubgraphExtractionResult['subgraph']['stats']['byKind'],
        ),
      },
    },
    prunedNodeIds,
    cascadeDelayHints,
  };
}
