/**
 * 从 PhysicalRealityModel + 冰岛 F-road 种子 + 行程 segment 物化 GlobalSpatiotemporalGraph。
 */

import { ICELAND_ROAD_DEPENDENCY_GRAPH_V0 } from '../constraints/iceland-road-dependency-graph.v0';
import type { PhysicalRealityModel } from '../models/physical-reality.model';
import type { RouteSegment } from '../shared/world-model.types';
import {
  GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1,
  type GlobalGraphEdge,
  type GlobalGraphNode,
  type GlobalSpatiotemporalGraphSnapshot,
} from './global-spatiotemporal-graph.types';

const ICELAND_F_ROAD_OPEN_MONTHS = [6, 7, 8, 9];

function pushNode(nodes: GlobalGraphNode[], seen: Set<string>, node: GlobalGraphNode): void {
  if (seen.has(node.id)) return;
  seen.add(node.id);
  nodes.push(node);
}

function pushEdge(edges: GlobalGraphEdge[], seen: Set<string>, edge: GlobalGraphEdge): void {
  if (seen.has(edge.id)) return;
  seen.add(edge.id);
  edges.push(edge);
}

export function buildGlobalGraphFromWorldContext(
  physical: PhysicalRealityModel,
  options?: { segments?: RouteSegment[]; countryCode?: string },
): GlobalSpatiotemporalGraphSnapshot {
  const countryCode = options?.countryCode ?? physical.countryCode ?? 'IS';
  const nodes: GlobalGraphNode[] = [];
  const edges: GlobalGraphEdge[] = [];
  const nodeSeen = new Set<string>();
  const edgeSeen = new Set<string>();

  if (countryCode === 'IS') {
    for (const seg of ICELAND_ROAD_DEPENDENCY_GRAPH_V0.segments) {
      const gateId = `road:${seg.roadId}`;
      pushNode(nodes, nodeSeen, {
        id: gateId,
        kind: 'F_ROAD_GATE',
        countryCode,
        label: seg.roadId,
        properties: { requires4x4: true, maxSlopePct: 28, roadId: seg.roadId },
        validity: { openMonths: ICELAND_F_ROAD_OPEN_MONTHS },
      });
      for (const poiId of seg.dependentPOIs) {
        pushNode(nodes, nodeSeen, {
          id: poiId,
          kind: 'POI',
          countryCode,
          label: poiId,
          properties: { dependentRoad: seg.roadId },
        });
        pushEdge(edges, edgeSeen, {
          id: `gate:${seg.roadId}:${poiId}`,
          kind: 'GATES',
          fromNodeId: gateId,
          toNodeId: poiId,
        });
      }
    }
  }

  for (const road of physical.roadStates ?? []) {
    const nodeId = `road:${road.roadId ?? road.segmentId}`;
    pushNode(nodes, nodeSeen, {
      id: nodeId,
      kind: String(road.roadId ?? '').startsWith('F') ? 'F_ROAD_GATE' : 'ROAD_SEGMENT',
      countryCode,
      label: String(road.roadId ?? road.segmentId ?? nodeId),
      properties: {
        status: road.status,
        requires4x4: road.requires4x4 ?? false,
        segmentId: road.segmentId,
      },
      validity:
        road.seasonOpenFrom && road.seasonOpenTo
          ? {
              openMonths: Array.from(
                { length: road.seasonOpenTo - road.seasonOpenFrom + 1 },
                (_, i) => road.seasonOpenFrom! + i,
              ),
            }
          : undefined,
    });
  }

  for (const hazard of physical.hazardZones ?? []) {
    pushNode(nodes, nodeSeen, {
      id: `hazard:${hazard.zoneId}`,
      kind: 'HAZARD_ZONE',
      countryCode,
      label: hazard.zoneId,
      properties: { type: hazard.type, level: hazard.level },
    });
  }

  const segmentList = options?.segments ?? [];
  for (let i = 0; i < segmentList.length; i++) {
    const seg = segmentList[i];
    const segNodeId = seg.graphRelations?.graphNodeId ?? `seg:${seg.segmentId}`;
    pushNode(nodes, nodeSeen, {
      id: segNodeId,
      kind: 'ROAD_SEGMENT',
      countryCode,
      label: seg.segmentId,
      properties: {
        distanceKm: seg.distanceKm,
        ascentM: seg.ascentM,
        slopePct: seg.slopePct,
        maxSlopePct: seg.slopePct,
      },
    });
    const fromId = seg.graphRelations?.fromPlaceId ?? (i > 0 ? `seg:${segmentList[i - 1].segmentId}` : undefined);
    const toId = seg.graphRelations?.toPlaceId;
    if (fromId) {
      pushEdge(edges, edgeSeen, {
        id: `connects:${fromId}:${segNodeId}`,
        kind: 'CONNECTS_TO',
        fromNodeId: fromId,
        toNodeId: segNodeId,
        weight: { distanceKm: seg.distanceKm, reliability01: 0.85 },
      });
    }
    if (toId) {
      pushEdge(edges, edgeSeen, {
        id: `connects:${segNodeId}:${toId}`,
        kind: 'CONNECTS_TO',
        fromNodeId: segNodeId,
        toNodeId: toId,
        weight: { distanceKm: seg.distanceKm, reliability01: 0.85 },
      });
    }
  }

  const byKind = nodes.reduce(
    (acc, n) => {
      acc[n.kind] = (acc[n.kind] ?? 0) + 1;
      return acc;
    },
    {} as GlobalSpatiotemporalGraphSnapshot['stats']['byKind'],
  );

  return {
    schemaVersion: GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1,
    countryCode,
    emittedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: { nodeCount: nodes.length, edgeCount: edges.length, byKind },
  };
}

export function resolveSubgraphAnchorNodeIds(segments: RouteSegment[]): string[] {
  const anchors = new Set<string>();
  for (const seg of segments) {
    if (seg.graphRelations?.fromPlaceId) anchors.add(seg.graphRelations.fromPlaceId);
    if (seg.graphRelations?.toPlaceId) anchors.add(seg.graphRelations.toPlaceId);
    anchors.add(seg.graphRelations?.graphNodeId ?? `seg:${seg.segmentId}`);
  }
  return Array.from(anchors);
}
