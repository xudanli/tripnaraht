import { randomUUID } from 'crypto';
import type { ResolutionResult } from '../../canonical-poi-resolution/types/canonical-poi.types';
import {
  CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
  type CanonicalTravelGraph,
  type TravelGraphBookingNode,
  type TravelGraphDayNode,
  type TravelGraphEdge,
  type TravelGraphNode,
  type TravelGraphPoiNode,
} from '../contracts/canonical-travel-graph.types';
import type { PlannerDraftIR, PlannerDraftSlot } from '../contracts/planner-draft-ir.types';

export type SlotResolutionMap = Map<string, ResolutionResult>;

function nodeId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function isRouteSlot(slot: PlannerDraftSlot): boolean {
  return slot.hintType === 'route';
}

function isPoiLikeSlot(slot: PlannerDraftSlot): boolean {
  if (isRouteSlot(slot)) return false;
  return slot.hintType === 'poi' || slot.hintType === 'activity' || slot.hintType === 'stay';
}

function resolutionStatusToCanonicalStatus(
  status: ResolutionResult['status'],
): 'RESOLVED' | 'UNRESOLVED' | ResolutionResult['status'] {
  if (status === 'MATCHED') return 'RESOLVED';
  if (status === 'NOT_FOUND') return 'UNRESOLVED';
  return status;
}

function buildPoiNode(
  slot: PlannerDraftSlot,
  dayIndex: number,
  resolution?: ResolutionResult,
): TravelGraphPoiNode {
  const id = nodeId('poi');
  const matched = resolution?.status === 'MATCHED';
  return {
    nodeId: id,
    kind: 'POI',
    label: slot.rawText,
    dayIndex,
    sourceSlotId: slot.slotId,
    poiId: resolution?.poiId,
    displayNames: resolution?.matchedPoi
      ? { en: resolution.matchedPoi.canonicalName }
      : undefined,
    canonical: matched
      ? {
          poiId: resolution?.poiId,
          placeId: slot.metadata?.placeId as string | undefined,
        }
      : undefined,
    canonicalization: resolution
      ? {
          rawText: slot.rawText,
          canonical: { poiId: resolution.poiId },
          status: resolutionStatusToCanonicalStatus(resolution.status),
          confidence: resolution.confidence,
          method: resolution.method,
          evidenceRefs: resolution.evidence?.map((e) => `${e.stage}:${e.label}`),
        }
      : undefined,
    evidenceRefs: slot.evidenceRefs,
  };
}

function buildDayNode(day: PlannerDraftIR['days'][number]): TravelGraphDayNode {
  return {
    nodeId: nodeId('day'),
    kind: 'DAY',
    label: day.label ?? `Day ${day.dayIndex + 1}`,
    dayIndex: day.dayIndex,
    date: day.date,
  };
}

function linkSequential(
  edges: TravelGraphEdge[],
  nodes: TravelGraphNode[],
  dayNode: TravelGraphDayNode,
  daySlots: TravelGraphNode[],
): void {
  for (const child of daySlots) {
    edges.push({
      edgeId: nodeId('edge'),
      kind: 'CONTAINS',
      from: { nodeId: dayNode.nodeId, kind: 'DAY' },
      to: { nodeId: child.nodeId, kind: child.kind },
      confidence: 1,
    });
  }

  for (let i = 1; i < daySlots.length; i += 1) {
    const prev = daySlots[i - 1]!;
    const next = daySlots[i]!;
    edges.push({
      edgeId: nodeId('edge'),
      kind: 'AFTER',
      from: { nodeId: prev.nodeId, kind: prev.kind },
      to: { nodeId: next.nodeId, kind: next.kind },
      confidence: 0.9,
    });
  }
}

export function buildCanonicalTravelGraph(params: {
  draft: PlannerDraftIR;
  compileId: string;
  resolutions: SlotResolutionMap;
}): CanonicalTravelGraph {
  const { draft, compileId, resolutions } = params;
  const nodes: TravelGraphNode[] = [];
  const edges: TravelGraphEdge[] = [];
  const days: TravelGraphDayNode[] = [];
  const bookings: TravelGraphBookingNode[] = [];
  let poiResolved = 0;
  let poiUnresolved = 0;

  for (const day of draft.days) {
    const dayNode = buildDayNode(day);
    days.push(dayNode);
    nodes.push(dayNode);

    const dayChildNodes: TravelGraphNode[] = [];
    for (const slot of day.slots) {
      if (!isPoiLikeSlot(slot)) continue;
      const resolution = resolutions.get(slot.slotId);
      const poiNode = buildPoiNode(slot, day.dayIndex, resolution);
      nodes.push(poiNode);
      dayChildNodes.push(poiNode);

      if (resolution?.status === 'MATCHED') poiResolved += 1;
      else poiUnresolved += 1;
    }

    linkSequential(edges, nodes, dayNode, dayChildNodes);
  }

  for (let d = 1; d < days.length; d += 1) {
    const prevDay = days[d - 1]!;
    const nextDay = days[d]!;
    edges.push({
      edgeId: nodeId('edge'),
      kind: 'NEXT_DAY',
      from: { nodeId: prevDay.nodeId, kind: 'DAY' },
      to: { nodeId: nextDay.nodeId, kind: 'DAY' },
      confidence: 1,
    });
  }

  const graphId = `ctg_${draft.tripId ?? draft.compileRequestId}_${compileId.slice(0, 8)}`;

  return {
    schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
    graphId,
    compileId,
    tripId: draft.tripId,
    requestId: draft.requestId,
    destination: {
      countryCode: draft.destination.countryCode,
      region: draft.destination.region,
    },
    createdAt: new Date().toISOString(),
    days,
    nodes,
    edges,
    dependencies: [],
    constraints: [],
    bookings,
    evidenceCatalog: draft.evidenceCatalog ?? [],
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      poiResolved,
      poiUnresolved,
      routeTemplatesResolved: 0,
      routeTemplatesTotal: 0,
      routeSegmentsResolved: 0,
      routeSegmentsTotal: 0,
      bookingRequired: 0,
      dependencySatisfied: 0,
      dependencyTotal: 0,
    },
  };
}
