/**
 * PR-3 Topology Mutation — F-road 封路时在 GlobalSpatiotemporalGraph 上生成异构子图候选。
 *
 * Ring vs F208：当 F-road gate 被 prune，将 F 段替换为环岛 continuity 绕行段（repair-spatial-poi-v2）。
 */

import type { PhysicalRealityModel } from '../models/physical-reality.model';
import type { RoutePlanDraft, RouteSegment } from '../shared/world-model.types';
import {
  buildGlobalGraphFromWorldContext,
  resolveSubgraphAnchorNodeIds,
} from './global-graph-from-world.util';
import { extractConstrainedSubgraph } from './subgraph-extraction.util';
import type { SubgraphExtractionResult } from './global-spatiotemporal-graph.types';

export const REPAIR_SPATIAL_POI_V2_ID = 'repair-spatial-poi-v2';

export type TopologyMutationStrategy = 'RING_ROAD_CONTINUITY' | 'F_ROAD_GATE_PRUNE';

export interface TopologyMutationContext {
  physical: PhysicalRealityModel;
  month: number;
  vehicleType?: '2WD' | '4WD';
  maxSlopePct?: number;
  maxDailyAscentM?: number;
  /** Explicit closed roads (e.g. RAG SSOT); falls back to physical.roadStates CLOSED */
  closedRoadIds?: string[];
}

export interface TopologyMutationResult {
  id: typeof REPAIR_SPATIAL_POI_V2_ID;
  plan: RoutePlanDraft;
  strategy: TopologyMutationStrategy;
  replacedRoadIds: string[];
  prunedNodeIds: string[];
  subgraphStats: { nodeCount: number; edgeCount: number };
  summary: string;
}

/** 冰岛环岛南线 continuity 模板（无 map API；与 storm reroute 启发式对齐） */
const RING_SOUTH_CONTINUITY_SEGMENTS: Omit<RouteSegment, 'segmentId'>[] = [
  {
    dayIndex: 2,
    distanceKm: 272,
    ascentM: 80,
    slopePct: 4,
    graphRelations: {
      fromPlaceId: 'place:vik',
      toPlaceId: 'place:hofn',
      graphNodeId: 'seg:ring-vik-hofn',
      relationType: 'CONNECTS_TO',
    },
    metadata: { topologyMutation: 'RING_ROAD_CONTINUITY', roadClass: 'RING_1' },
  },
  {
    dayIndex: 2,
    distanceKm: 187,
    ascentM: 60,
    slopePct: 3,
    graphRelations: {
      fromPlaceId: 'place:hofn',
      toPlaceId: 'place:egilsstadir',
      graphNodeId: 'seg:ring-hofn-egils',
      relationType: 'CONNECTS_TO',
    },
    metadata: { topologyMutation: 'RING_ROAD_CONTINUITY', roadClass: 'RING_1' },
  },
];

const WORLD_ROAD_VIOLATION_PREFIXES = ['WORLD_ROAD_', 'ROAD_CLOSED', 'ROAD_CLOSURE', 'ROAD_BLOCKED'];

export function isTopologyMutationViolation(codes: string[]): boolean {
  const upper = codes.map((c) => String(c || '').toUpperCase());
  return upper.some(
    (c) =>
      WORLD_ROAD_VIOLATION_PREFIXES.some((p) => c.startsWith(p) || c.includes(p)) ||
      /^F\d/.test(c) ||
      c.includes('F208') ||
      c.includes('F_ROAD'),
  );
}

export function normalizeRoadNodeId(roadId: string): string {
  const raw = String(roadId || '').trim();
  if (!raw) return '';
  return raw.startsWith('road:') ? raw : `road:${raw.replace(/^road:/, '')}`;
}

export function resolveClosedRoadIdsFromContext(ctx: TopologyMutationContext): string[] {
  const explicit = (ctx.closedRoadIds ?? []).map(normalizeRoadNodeId).filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];

  return [
    ...new Set(
      (ctx.physical.roadStates ?? [])
        .filter((r) => r.status === 'CLOSED' || r.status === 'RESTRICTED')
        .map((r) => normalizeRoadNodeId(r.roadId ?? r.segmentId ?? ''))
        .filter(Boolean),
    ),
  ];
}

export function segmentReferencesClosedRoad(segment: RouteSegment, closedRoadIds: string[]): boolean {
  if (!closedRoadIds.length) return false;

  const roadTokens = closedRoadIds.map((id) => id.replace(/^road:/, '').toUpperCase());
  const gr = segment.graphRelations;
  const md = segment.metadata ?? {};

  for (const token of roadTokens) {
    if (String(gr?.fromPlaceId ?? '').toUpperCase().includes(token)) return true;
    if (String(gr?.toPlaceId ?? '').toUpperCase().includes(token)) return true;
    if (String(gr?.graphNodeId ?? '').toUpperCase().includes(token)) return true;
    if (String(md.roadId ?? '').toUpperCase() === token) return true;
  }
  return false;
}

export function runSubgraphPreflightForMutation(
  ctx: TopologyMutationContext,
  plan: RoutePlanDraft,
): SubgraphExtractionResult {
  const segments = plan.segments ?? [];
  const closedNodeIds = resolveClosedRoadIdsFromContext(ctx);
  const globalGraph = buildGlobalGraphFromWorldContext(ctx.physical, {
    segments,
    countryCode: ctx.physical.countryCode,
  });
  const anchorNodeIds = resolveSubgraphAnchorNodeIds(segments);
  const seeds = anchorNodeIds.length ? anchorNodeIds : globalGraph.nodes.slice(0, 3).map((n) => n.id);

  return extractConstrainedSubgraph(globalGraph, {
    countryCode: ctx.physical.countryCode ?? 'IS',
    anchorNodeIds: seeds,
    month: ctx.month,
    vehicleType: ctx.vehicleType,
    maxSlopePct: ctx.maxSlopePct,
    maxDailyAscentM: ctx.maxDailyAscentM,
    excludeNodeIds: closedNodeIds,
    perturbation: { closedNodeIds },
  });
}

function buildRingBypassSegments(
  plan: RoutePlanDraft,
  replacedRoadIds: string[],
): RouteSegment[] {
  const segs = plan.segments ?? [];
  const anchorDay =
    segs.find((s) => segmentReferencesClosedRoad(s, replacedRoadIds))?.dayIndex ??
    Math.max(0, ...segs.map((s) => s.dayIndex ?? 0));

  return RING_SOUTH_CONTINUITY_SEGMENTS.map((template, i) => ({
    ...template,
    segmentId: `seg-topology-ring-${i}-${replacedRoadIds.map((r) => r.replace(/^road:/, '')).join('-')}`,
    dayIndex: anchorDay + (i > 0 ? 0 : 0),
    metadata: {
      ...(template.metadata ?? {}),
      replacesRoads: replacedRoadIds.map((r) => r.replace(/^road:/, '')),
    },
  }));
}

/**
 * 当 F-road / WORLD_ROAD 硬约束触发时，生成 repair-spatial-poi-v2 拓扑变异方案。
 */
export function applyTopologyMutation(
  plan: RoutePlanDraft,
  ctx: TopologyMutationContext,
): TopologyMutationResult | undefined {
  const closedRoadIds = resolveClosedRoadIdsFromContext(ctx);
  const segments = plan.segments ?? [];
  if (!segments.length) return undefined;

  const touchesClosed = segments.some((s) => segmentReferencesClosedRoad(s, closedRoadIds));
  const preflight = runSubgraphPreflightForMutation(ctx, plan);
  const prunedFRoad = preflight.prunedNodeIds.some((id) => /f\d|f-road|f208/i.test(id));

  if (!touchesClosed && !prunedFRoad && !closedRoadIds.length) {
    return undefined;
  }

  const replacedRoadIds =
    closedRoadIds.length > 0
      ? closedRoadIds
      : preflight.prunedNodeIds.filter((id) => /^road:F/i.test(id));

  const kept = segments.filter((s) => !segmentReferencesClosedRoad(s, replacedRoadIds));
  const bypass = buildRingBypassSegments(plan, replacedRoadIds.length ? replacedRoadIds : ['road:F208']);

  const mutated: RoutePlanDraft = {
    ...plan,
    segments: [...kept, ...bypass],
  };

  return {
    id: REPAIR_SPATIAL_POI_V2_ID,
    plan: mutated,
    strategy: 'RING_ROAD_CONTINUITY',
    replacedRoadIds: replacedRoadIds.length ? replacedRoadIds : ['road:F208'],
    prunedNodeIds: preflight.prunedNodeIds,
    subgraphStats: {
      nodeCount: preflight.subgraph.stats.nodeCount,
      edgeCount: preflight.subgraph.stats.edgeCount,
    },
    summary: `拓扑变异：${replacedRoadIds.map((r) => r.replace(/^road:/, '')).join('、')} 封路 → 环岛南线 continuity 绕行（${REPAIR_SPATIAL_POI_V2_ID}）`,
  };
}
