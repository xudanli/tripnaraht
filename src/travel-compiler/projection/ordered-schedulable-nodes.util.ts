import type {
  CanonicalTravelGraph,
  TravelGraphBookingNode,
  TravelGraphNode,
  TravelGraphPoiNode,
  TravelGraphRouteSegmentNode,
} from '../contracts/canonical-travel-graph.types';

const SCHEDULABLE_KINDS = new Set<TravelGraphNode['kind']>([
  'POI',
  'ROUTE_SEGMENT',
  'STAY',
  'ACTIVITY',
  'BOOKING',
  'TIMELINE_SLOT',
]);

function isSchedulableNode(node: TravelGraphNode): boolean {
  return SCHEDULABLE_KINDS.has(node.kind);
}

function poiIdFromNode(node: TravelGraphNode): string | undefined {
  if (node.kind !== 'POI') return undefined;
  const poi = node as TravelGraphPoiNode;
  return poi.canonical?.poiId ?? poi.poiId;
}

function orderNodesByAfterEdges(nodes: TravelGraphNode[], graph: CanonicalTravelGraph): TravelGraphNode[] {
  if (nodes.length <= 1) return [...nodes];

  const afterMap = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'AFTER') continue;
    afterMap.set(edge.from.nodeId, edge.to.nodeId);
  }

  const ids = new Set(nodes.map((n) => n.nodeId));
  const start = nodes.find((n) => !nodes.some((other) => afterMap.get(other.nodeId) === n.nodeId));
  const ordered: TravelGraphNode[] = [];
  let cursor = start?.nodeId;
  const seen = new Set<string>();

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = nodes.find((n) => n.nodeId === cursor);
    if (node) ordered.push(node);
    cursor = afterMap.get(cursor);
  }

  for (const node of nodes) {
    if (!seen.has(node.nodeId)) ordered.push(node);
  }

  return ordered.filter((n) => ids.has(n.nodeId));
}

function findSegmentBetween(
  graph: CanonicalTravelGraph,
  dayIndex: number,
  fromPoiId: string,
  toPoiId: string,
): TravelGraphRouteSegmentNode | undefined {
  for (const n of graph.nodes) {
    if (n.kind !== 'ROUTE_SEGMENT' || n.dayIndex !== dayIndex) continue;
    const seg = n as TravelGraphRouteSegmentNode;
    if (seg.fromPoiId === fromPoiId && seg.toPoiId === toPoiId) {
      return seg;
    }
  }
  return undefined;
}

function interleaveRouteSegments(
  graph: CanonicalTravelGraph,
  dayIndex: number,
  ordered: TravelGraphNode[],
): TravelGraphNode[] {
  const out: TravelGraphNode[] = [];
  const placedSegmentIds = new Set<string>();

  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i]!;
    out.push(current);

    const next = ordered[i + 1];
    if (current.kind !== 'POI' || next?.kind !== 'POI') continue;

    const fromId = poiIdFromNode(current);
    const toId = poiIdFromNode(next);
    if (!fromId || !toId) continue;

    const segment = findSegmentBetween(graph, dayIndex, fromId, toId);
    if (segment && !placedSegmentIds.has(segment.nodeId)) {
      placedSegmentIds.add(segment.nodeId);
      out.push(segment);
    }
  }

  for (const node of ordered) {
    if (node.kind === 'ROUTE_SEGMENT' && !placedSegmentIds.has(node.nodeId)) {
      out.push(node);
    }
  }

  return out;
}

function attachBookingsAfterLinkedNodes(
  graph: CanonicalTravelGraph,
  dayIndex: number,
  ordered: TravelGraphNode[],
): TravelGraphNode[] {
  const out = [...ordered];
  const placed = new Set(out.map((n) => n.nodeId));

  const bookings = graph.nodes.filter(
    (n): n is TravelGraphBookingNode => n.kind === 'BOOKING' && n.dayIndex === dayIndex,
  );

  for (const booking of bookings) {
    if (placed.has(booking.nodeId)) continue;
    const linkedId = booking.linkedNodeId;
    if (!linkedId) {
      out.push(booking);
      placed.add(booking.nodeId);
      continue;
    }

    const anchorIdx = out.findIndex((n) => n.nodeId === linkedId);
    if (anchorIdx >= 0) {
      out.splice(anchorIdx + 1, 0, booking);
    } else {
      out.push(booking);
    }
    placed.add(booking.nodeId);
  }

  return out;
}

function collectDaySchedulableNodes(graph: CanonicalTravelGraph, dayIndex: number): TravelGraphNode[] {
  const dayNode = graph.days.find((d) => d.dayIndex === dayIndex);
  const containedIds = new Set<string>();

  if (dayNode) {
    for (const edge of graph.edges) {
      if (edge.kind !== 'CONTAINS' || edge.from.nodeId !== dayNode.nodeId) continue;
      if (edge.to.kind === 'ROUTE') continue;
      containedIds.add(edge.to.nodeId);
    }
  }

  const onDay = graph.nodes.filter(
    (n) => n.dayIndex === dayIndex && isSchedulableNode(n),
  );

  const candidates =
    containedIds.size > 0
      ? onDay.filter(
          (n) =>
            containedIds.has(n.nodeId) ||
            n.kind === 'ROUTE_SEGMENT' ||
            n.kind === 'STAY' ||
            n.kind === 'BOOKING',
        )
      : onDay;

  const withoutSegments = candidates.filter((n) => n.kind !== 'ROUTE_SEGMENT');
  const orderedCore = orderNodesByAfterEdges(withoutSegments, graph);
  return attachBookingsAfterLinkedNodes(
    graph,
    dayIndex,
    interleaveRouteSegments(graph, dayIndex, orderedCore),
  );
}

export function orderedSchedulableNodesForDay(
  graph: CanonicalTravelGraph,
  dayIndex: number,
): TravelGraphNode[] {
  return collectDaySchedulableNodes(graph, dayIndex);
}
