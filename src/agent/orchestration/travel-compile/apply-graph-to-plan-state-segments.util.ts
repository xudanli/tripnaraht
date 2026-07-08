import type {
  CanonicalTravelGraph,
  TravelGraphPoiNode,
  TravelGraphRouteNode,
} from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../../trips/decision/shared/world-model.types';
import { collectSegmentStops } from '../../utils/planning-workbench-execute-enrich.util';

export type GraphPlanStateSegmentEnrichment = {
  segmentsUpdated: number;
  poiTagsApplied: number;
  routeTemplatesTagged: number;
};

type PoiLookupEntry = {
  poiId: string;
  nodeId: string;
  dayIndex?: number;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function poiIdOf(node: TravelGraphPoiNode): string | undefined {
  return node.canonical?.poiId ?? node.poiId;
}

function buildPoiLookup(graph: CanonicalTravelGraph): Map<string, PoiLookupEntry[]> {
  const map = new Map<string, PoiLookupEntry[]>();

  const add = (rawName: string | undefined, entry: PoiLookupEntry) => {
    if (!rawName?.trim()) return;
    const key = normalizeName(rawName);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  };

  for (const node of graph.nodes) {
    if (node.kind !== 'POI') continue;
    const poi = node as TravelGraphPoiNode;
    const poiId = poiIdOf(poi);
    if (!poiId) continue;
    const entry: PoiLookupEntry = {
      poiId,
      nodeId: poi.nodeId,
      dayIndex: poi.dayIndex,
    };
    add(poi.label, entry);
    add(poi.displayNames?.en, entry);
    add(poi.displayNames?.zh, entry);
    add(poi.displayNames?.local, entry);
  }

  return map;
}

function resolvePoiForName(
  name: string,
  dayIndex: number,
  lookup: Map<string, PoiLookupEntry[]>,
): PoiLookupEntry | undefined {
  const key = normalizeName(name);
  const exact = lookup.get(key)?.find((e) => e.dayIndex === undefined || e.dayIndex === dayIndex);
  if (exact) return exact;

  for (const [candidateKey, entries] of lookup.entries()) {
    if (!candidateKey.includes(key) && !key.includes(candidateKey)) continue;
    const match = entries.find((e) => e.dayIndex === undefined || e.dayIndex === dayIndex);
    if (match) return match;
  }

  return undefined;
}

function tagPoiLikeEntry(
  entry: unknown,
  resolved: PoiLookupEntry,
): Record<string, unknown> {
  const base =
    entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : { name: String(entry) };
  return {
    ...base,
    canonical_poi_id: resolved.poiId,
    graph_node_id: resolved.nodeId,
  };
}

function tagPoiArray(
  raw: unknown,
  dayIndex: number,
  lookup: Map<string, PoiLookupEntry[]>,
): { value: unknown; tagged: number } {
  if (!Array.isArray(raw)) return { value: raw, tagged: 0 };
  let tagged = 0;
  const value = raw.map((entry) => {
    const name =
      (entry && typeof entry === 'object'
        ? ((entry as Record<string, unknown>).nameCN ??
          (entry as Record<string, unknown>).nameEN ??
          (entry as Record<string, unknown>).name)
        : entry) as string | undefined;
    if (typeof name !== 'string' || !name.trim()) return entry;
    const resolved = resolvePoiForName(name, dayIndex, lookup);
    if (!resolved) return entry;
    tagged += 1;
    return tagPoiLikeEntry(entry, resolved);
  });
  return { value, tagged };
}

function routeTemplateForDay(graph: CanonicalTravelGraph, dayIndex: number): TravelGraphRouteNode | undefined {
  for (const node of graph.nodes) {
    if (node.kind !== 'ROUTE' || node.dayIndex !== dayIndex) continue;
    const route = node as TravelGraphRouteNode;
    if (route.routeTemplateId ?? route.canonical?.routeTemplateId) return route;
  }
  return undefined;
}

/**
 * CTRE 编译后：将 CanonicalTravelGraph 中的 POI / Route 解析结果回写到 PlanState segments.metadata，
 * 供 Workbench Compare / 时间线展示 canonical_poi_id。
 */
export function applyGraphCanonicalTagsToPlanState(params: {
  planState: PlanState;
  graph: CanonicalTravelGraph;
}): GraphPlanStateSegmentEnrichment {
  const { planState, graph } = params;
  const lookup = buildPoiLookup(graph);
  let segmentsUpdated = 0;
  let poiTagsApplied = 0;
  let routeTemplatesTagged = 0;

  const segments = planState.itinerary?.segments ?? [];
  const nextSegments: RouteSegment[] = [];

  for (const segment of segments) {
    const metadata = { ...(segment.metadata ?? {}) } as Record<string, unknown>;
    let segmentChanged = false;

    const attractions = tagPoiArray(metadata.attractions, segment.dayIndex, lookup);
    if (attractions.tagged > 0) {
      metadata.attractions = attractions.value;
      poiTagsApplied += attractions.tagged;
      segmentChanged = true;
    }

    const restaurants = tagPoiArray(metadata.restaurants, segment.dayIndex, lookup);
    if (restaurants.tagged > 0) {
      metadata.restaurants = restaurants.value;
      poiTagsApplied += restaurants.tagged;
      segmentChanged = true;
    }

    if (metadata.accommodation) {
      const accName = poiDisplayNameFromMetadata(metadata.accommodation);
      if (accName) {
        const resolved = resolvePoiForName(accName, segment.dayIndex, lookup);
        if (resolved) {
          metadata.accommodation = tagPoiLikeEntry(metadata.accommodation, resolved);
          poiTagsApplied += 1;
          segmentChanged = true;
        }
      }
    }

    const stopNames = collectSegmentStops(metadata);
    const ctreResolvedPois: Array<{ name: string; canonical_poi_id: string; graph_node_id: string }> = [];
    for (const stopName of stopNames) {
      const resolved = resolvePoiForName(stopName, segment.dayIndex, lookup);
      if (!resolved) continue;
      ctreResolvedPois.push({
        name: stopName,
        canonical_poi_id: resolved.poiId,
        graph_node_id: resolved.nodeId,
      });
    }
    if (ctreResolvedPois.length > 0) {
      metadata.ctreResolvedPois = ctreResolvedPois;
      if (!metadata.primaryPoiTitle) {
        metadata.primaryPoiTitle = ctreResolvedPois[0]?.name;
      }
      segmentChanged = true;
    }

    const routeNode = routeTemplateForDay(graph, segment.dayIndex);
    const routeTemplateId = routeNode?.routeTemplateId ?? routeNode?.canonical?.routeTemplateId;
    if (routeNode && routeTemplateId) {
      metadata.routeTemplateId = routeTemplateId;
      metadata.ctreRouteNodeId = routeNode.nodeId;
      routeTemplatesTagged += 1;
      segmentChanged = true;
    }

    if (segmentChanged) {
      segmentsUpdated += 1;
      nextSegments.push({ ...segment, metadata });
    } else {
      nextSegments.push(segment);
    }
  }

  if (segmentsUpdated > 0 && planState.itinerary) {
    planState.itinerary.segments = nextSegments;
  }

  planState.metadata = {
    ...(planState.metadata ?? {}),
    ctre_segment_enrichment: {
      segmentsUpdated,
      poiTagsApplied,
      routeTemplatesTagged,
      graphId: graph.graphId,
      compileId: graph.compileId,
    },
  };

  return { segmentsUpdated, poiTagsApplied, routeTemplatesTagged };
}

function poiDisplayNameFromMetadata(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const nested = p.poi as Record<string, unknown> | undefined;
  return (
    (p.nameCN as string | undefined) ??
    (p.nameEN as string | undefined) ??
    (p.name as string | undefined) ??
    (nested?.nameCN as string | undefined) ??
    (nested?.nameEN as string | undefined)
  );
}
