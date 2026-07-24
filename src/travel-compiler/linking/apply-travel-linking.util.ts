import { randomUUID } from 'crypto';
import type {
  CanonicalTravelGraph,
  TravelGraphBookingNode,
  TravelGraphEdge,
  TravelGraphNode,
  TravelGraphPoiNode,
} from '../contracts/canonical-travel-graph.types';
import {
  buildDependencyFromRule,
  inferIntentFromText,
  resolveIcelandPoiRule,
} from '../rules/iceland-travel-link.rules';

export type SemanticLinkingStats = {
  intentTagged: number;
  dependenciesAdded: number;
  bookingsAdded: number;
  edgesAdded: number;
};

export function applyTravelSemanticAndLinking(
  graph: CanonicalTravelGraph,
  countryCode: string,
): { graph: CanonicalTravelGraph; stats: SemanticLinkingStats } {
  if (countryCode.toUpperCase() !== 'IS') {
    return {
      graph,
      stats: { intentTagged: 0, dependenciesAdded: 0, bookingsAdded: 0, edgesAdded: 0 },
    };
  }

  const stats: SemanticLinkingStats = {
    intentTagged: 0,
    dependenciesAdded: 0,
    bookingsAdded: 0,
    edgesAdded: 0,
  };

  const poiNodes = graph.nodes.filter((n): n is TravelGraphPoiNode => n.kind === 'POI');

  for (const node of poiNodes) {
    const poiId = node.canonical?.poiId ?? node.poiId;
    const rule = resolveIcelandPoiRule(poiId);
    const inferred = inferIntentFromText(node.label);

    node.intentTags = rule?.intentTags ?? inferred.intentTags;
    stats.intentTagged += 1;

    if (rule?.activityType || inferred.activityType) {
      node.canonical = {
        ...node.canonical,
        poiId,
        activityType: rule?.activityType ?? inferred.activityType,
      };
    }

    if (rule) {
      const deps = buildDependencyFromRule(rule, node.nodeId);
      graph.dependencies.push(...deps);
      stats.dependenciesAdded += deps.length;

      for (const dep of deps) {
        graph.edges.push(makeEdge(dep.kind, node, dep.objectRef));
        stats.edgesAdded += 1;
      }

      if (rule.requiresBooking) {
        const bookingNode = makeBookingNode(node, rule.bookingKind ?? 'ticket');
        graph.nodes.push(bookingNode);
        graph.bookings.push(bookingNode);
        graph.edges.push({
          edgeId: `edge_${randomUUID().slice(0, 8)}`,
          kind: 'REQUIRES_BOOKING',
          from: { nodeId: node.nodeId, kind: 'POI' },
          to: { nodeId: bookingNode.nodeId, kind: 'BOOKING' },
          confidence: 0.95,
        });
        stats.bookingsAdded += 1;
        stats.edgesAdded += 1;
      }

      if (rule.constraintCode) {
        graph.constraints.push({
          constraintId: `cst_${randomUUID().slice(0, 8)}`,
          source: 'destination_pack',
          severity: 'soft',
          code: rule.constraintCode,
          message: rule.constraintMessage ?? rule.constraintCode,
          affectedNodeIds: [node.nodeId],
        });
      }
    }
  }

  graph.stats.dependencyTotal = graph.dependencies.length;
  graph.stats.bookingRequired = graph.bookings.filter((b) => b.required).length;

  return { graph, stats };
}

function makeBookingNode(
  poiNode: TravelGraphPoiNode,
  bookingKind: TravelGraphBookingNode['bookingKind'],
): TravelGraphBookingNode {
  return {
    nodeId: `booking_${randomUUID().slice(0, 8)}`,
    kind: 'BOOKING',
    label: `${poiNode.label} booking`,
    dayIndex: poiNode.dayIndex,
    linkedNodeId: poiNode.nodeId,
    bookingKind,
    required: true,
    status: 'required',
  };
}

function makeEdge(
  kind: TravelGraphEdge['kind'],
  fromNode: TravelGraphNode,
  objectRef: string,
): TravelGraphEdge {
  return {
    edgeId: `edge_${randomUUID().slice(0, 8)}`,
    kind,
    from: { nodeId: fromNode.nodeId, kind: fromNode.kind },
    to: { nodeId: objectRef, kind: 'CONSTRAINT' },
    confidence: 0.9,
    metadata: { objectRef },
  };
}
