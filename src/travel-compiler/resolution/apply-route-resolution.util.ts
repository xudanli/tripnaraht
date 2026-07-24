import { randomUUID } from 'crypto';
import type { CompileIssue } from '../contracts/compilation-result.types';
import type {
  CanonicalTravelGraph,
  TravelGraphDayNode,
  TravelGraphEdge,
  TravelGraphNode,
  TravelGraphPoiNode,
  TravelGraphRouteNode,
  TravelGraphRouteSegmentNode,
} from '../contracts/canonical-travel-graph.types';
import type { PlannerDraftIR, PlannerDraftSlot } from '../contracts/planner-draft-ir.types';
import type { RouteResolutionStats } from '../contracts/route-resolution.types';
import { matchRouteTemplate } from './route-template-matcher.util';

function nodeId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function isRouteSlot(slot: PlannerDraftSlot): boolean {
  return slot.hintType === 'route';
}

function findDayNode(graph: CanonicalTravelGraph, dayIndex: number): TravelGraphDayNode | undefined {
  return graph.days.find((d) => d.dayIndex === dayIndex);
}

function findPoiOnDay(
  graph: CanonicalTravelGraph,
  dayIndex: number,
  poiId: string,
): TravelGraphPoiNode | undefined {
  return graph.nodes.find(
    (n): n is TravelGraphPoiNode =>
      n.kind === 'POI' &&
      n.dayIndex === dayIndex &&
      ((n as TravelGraphPoiNode).poiId === poiId || n.canonical?.poiId === poiId),
  );
}

function ensureWaypointPoiNode(
  graph: CanonicalTravelGraph,
  dayIndex: number,
  poiId: string,
  label: string,
  sourceSlotId?: string,
): TravelGraphPoiNode {
  const existing = findPoiOnDay(graph, dayIndex, poiId);
  if (existing) return existing;

  const poiNode: TravelGraphPoiNode = {
    nodeId: nodeId('poi'),
    kind: 'POI',
    label,
    dayIndex,
    sourceSlotId,
    poiId,
    canonical: { poiId },
    canonicalization: {
      rawText: label,
      canonical: { poiId },
      status: 'RESOLVED',
      confidence: 0.9,
      method: 'ROUTE_TEMPLATE',
      evidenceRefs: ['route_template:waypoint'],
    },
    intentTags: ['nature'],
  };
  graph.nodes.push(poiNode);
  graph.stats.poiResolved += 1;
  return poiNode;
}

function collectRouteSlots(draft: PlannerDraftIR, countryCode: string): Array<{
  slot: PlannerDraftSlot;
  dayIndex: number;
  match: NonNullable<ReturnType<typeof matchRouteTemplate>>;
}> {
  const out: Array<{
    slot: PlannerDraftSlot;
    dayIndex: number;
    match: NonNullable<ReturnType<typeof matchRouteTemplate>>;
  }> = [];

  for (const day of draft.days) {
    for (const slot of day.slots) {
      const match = matchRouteTemplate(slot.rawText, countryCode);
      if (match || isRouteSlot(slot)) {
        if (match) {
          out.push({ slot, dayIndex: day.dayIndex, match });
        }
      }
    }
  }
  return out;
}

function linkRouteOnDay(
  graph: CanonicalTravelGraph,
  dayNode: TravelGraphDayNode,
  routeNode: TravelGraphRouteNode,
  waypointNodes: TravelGraphPoiNode[],
): void {
  graph.edges.push({
    edgeId: nodeId('edge'),
    kind: 'CONTAINS',
    from: { nodeId: dayNode.nodeId, kind: 'DAY' },
    to: { nodeId: routeNode.nodeId, kind: 'ROUTE' },
    confidence: 1,
  });

  for (const poi of waypointNodes) {
    graph.edges.push({
      edgeId: nodeId('edge'),
      kind: 'PART_OF_ROUTE',
      from: { nodeId: poi.nodeId, kind: 'POI' },
      to: { nodeId: routeNode.nodeId, kind: 'ROUTE' },
      confidence: 0.95,
    });
    graph.edges.push({
      edgeId: nodeId('edge'),
      kind: 'ON_ROUTE',
      from: { nodeId: poi.nodeId, kind: 'POI' },
      to: { nodeId: routeNode.nodeId, kind: 'ROUTE' },
      confidence: 0.9,
    });
  }

  for (let i = 1; i < waypointNodes.length; i += 1) {
    const prev = waypointNodes[i - 1]!;
    const next = waypointNodes[i]!;
    graph.edges.push({
      edgeId: nodeId('edge'),
      kind: 'AFTER',
      from: { nodeId: prev.nodeId, kind: 'POI' },
      to: { nodeId: next.nodeId, kind: 'POI' },
      confidence: 0.85,
      metadata: { viaRouteTemplateId: routeNode.routeTemplateId },
    });
  }
}

export function applyRouteResolution(params: {
  graph: CanonicalTravelGraph;
  draft: PlannerDraftIR;
  countryCode: string;
  warnings?: CompileIssue[];
  errors?: CompileIssue[];
}): { graph: CanonicalTravelGraph; stats: RouteResolutionStats } {
  const { graph, draft, countryCode } = params;
  const warnings = params.warnings ?? [];
  const errors = params.errors ?? [];

  const routeSlots = collectRouteSlots(draft, countryCode);
  const unresolvedRouteSlots: Array<{ slot: PlannerDraftSlot; dayIndex: number }> = [];

  for (const day of draft.days) {
    for (const slot of day.slots) {
      if (!isRouteSlot(slot)) continue;
      if (!matchRouteTemplate(slot.rawText, countryCode)) {
        unresolvedRouteSlots.push({ slot, dayIndex: day.dayIndex });
      }
    }
  }

  let templatesMatched = 0;
  let segmentsAdded = 0;
  let waypointPoisAdded = 0;
  const resolvedTemplateIds = new Set<string>();

  for (const { slot, dayIndex, match } of routeSlots) {
    const dayNode = findDayNode(graph, dayIndex);
    if (!dayNode) {
      warnings.push({
        issueId: randomUUID(),
        severity: 'warning',
        phase: 'ROUTE_RESOLUTION',
        code: 'ROUTE_DAY_NOT_FOUND',
        message: `Day node missing for route slot: ${slot.rawText}`,
        dayIndex,
        slotId: slot.slotId,
      });
      continue;
    }

    const { template } = match;
    const routeNode: TravelGraphRouteNode = {
      nodeId: nodeId('route'),
      kind: 'ROUTE',
      label: template.label,
      dayIndex,
      sourceSlotId: slot.slotId,
      routeTemplateId: template.routeTemplateId,
      segmentNodeIds: [],
      canonical: { routeTemplateId: template.routeTemplateId },
      canonicalization: {
        rawText: slot.rawText,
        canonical: { routeTemplateId: template.routeTemplateId },
        status: 'RESOLVED',
        confidence: match.confidence,
        method: 'ROUTE_TEMPLATE',
        evidenceRefs: [template.evidenceSource],
      },
      intentTags: ['transit'],
      metadata: { matchedText: match.matchedText },
    };

    const segmentNodes: TravelGraphRouteSegmentNode[] = [];
    for (const seg of template.segments) {
      const segmentNode: TravelGraphRouteSegmentNode = {
        nodeId: nodeId('seg'),
        kind: 'ROUTE_SEGMENT',
        label: `${seg.fromLabel} → ${seg.toLabel}`,
        dayIndex,
        segmentId: seg.segmentId,
        fromPoiId: seg.fromPoiId,
        toPoiId: seg.toPoiId,
        distanceKm: seg.distanceKm,
        durationMin: seg.durationMin,
        roadClass: seg.roadClass,
        transportMode: seg.transportMode,
        metadata: {
          seasonRisk: seg.seasonRisk,
          weatherRisk: seg.weatherRisk,
        },
      };
      segmentNodes.push(segmentNode);
      routeNode.segmentNodeIds!.push(segmentNode.nodeId);
      graph.nodes.push(segmentNode);
      graph.edges.push({
        edgeId: nodeId('edge'),
        kind: 'CONTAINS',
        from: { nodeId: routeNode.nodeId, kind: 'ROUTE' },
        to: { nodeId: segmentNode.nodeId, kind: 'ROUTE_SEGMENT' },
        confidence: 0.95,
      });
      segmentsAdded += 1;
    }

    const waypointNodes: TravelGraphPoiNode[] = [];
    for (let i = 0; i < template.waypointPoiIds.length; i += 1) {
      const poiId = template.waypointPoiIds[i]!;
      const label = template.waypointLabels[i] ?? poiId;
      const beforeCount = graph.nodes.length;
      const poiNode = ensureWaypointPoiNode(graph, dayIndex, poiId, label, slot.slotId);
      if (graph.nodes.length > beforeCount) waypointPoisAdded += 1;
      waypointNodes.push(poiNode);
    }

    graph.nodes.push(routeNode);
    linkRouteOnDay(graph, dayNode, routeNode, waypointNodes);

    templatesMatched += 1;
    resolvedTemplateIds.add(template.routeTemplateId);
  }

  for (const { slot, dayIndex } of unresolvedRouteSlots) {
    errors.push({
      issueId: randomUUID(),
      severity: 'error',
      phase: 'ROUTE_RESOLUTION',
      code: 'ROUTE_NOT_FOUND',
      message: `Route template not found: ${slot.rawText}`,
      dayIndex,
      slotId: slot.slotId,
    });
  }

  const routeTemplatesTotal = routeSlots.length + unresolvedRouteSlots.length;
  graph.stats.routeTemplatesResolved = templatesMatched;
  graph.stats.routeTemplatesTotal = routeTemplatesTotal;
  graph.stats.routeSegmentsResolved = segmentsAdded;
  graph.stats.routeSegmentsTotal = segmentsAdded;
  graph.stats.nodeCount = graph.nodes.length;
  graph.stats.edgeCount = graph.edges.length;

  return {
    graph,
    stats: {
      templatesMatched,
      templatesTotal: routeTemplatesTotal,
      segmentsAdded,
      waypointPoisAdded,
    },
  };
}

export function countRouteSlots(draft: PlannerDraftIR, countryCode: string): number {
  let total = 0;
  for (const day of draft.days) {
    for (const slot of day.slots) {
      if (slot.hintType === 'route' || matchRouteTemplate(slot.rawText, countryCode)) {
        total += 1;
      }
    }
  }
  return total;
}
