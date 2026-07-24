/**
 * Global Spatiotemporal Graph — 目的地级常驻异构时空图类型契约。
 */

import type { ISODate, ISOTime } from '../world-model';

export const GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1 = 'global-spatiotemporal-graph/v1' as const;

export type GlobalGraphNodeKind =
  | 'ROAD_SEGMENT'
  | 'F_ROAD_GATE'
  | 'POI'
  | 'WEATHER_STATION'
  | 'HAZARD_ZONE'
  | 'FERRY_TERMINAL'
  | 'PLACE';

export type GlobalGraphEdgeKind =
  | 'CONNECTS_TO'
  | 'OBSERVES'
  | 'GATES'
  | 'AFFECTS'
  | 'SEASONAL_OPEN'
  | 'HANDOFF';

export interface TemporalValidityWindow {
  dateFrom?: ISODate;
  dateTo?: ISODate;
  timeFrom?: ISOTime;
  timeTo?: ISOTime;
  openMonths?: number[];
}

export interface GlobalGraphNode {
  id: string;
  kind: GlobalGraphNodeKind;
  countryCode: string;
  label: string;
  labelZh?: string;
  lat?: number;
  lng?: number;
  properties: Record<string, unknown>;
  validity?: TemporalValidityWindow;
}

export interface GlobalGraphEdge {
  id: string;
  kind: GlobalGraphEdgeKind;
  fromNodeId: string;
  toNodeId: string;
  weight?: {
    distanceKm?: number;
    durationMin?: number;
    reliability01?: number;
  };
  validity?: TemporalValidityWindow;
  properties?: Record<string, unknown>;
}

export interface GlobalSpatiotemporalGraphSnapshot {
  schemaVersion: typeof GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1;
  countryCode: string;
  emittedAt: string;
  nodes: GlobalGraphNode[];
  edges: GlobalGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    byKind: Partial<Record<GlobalGraphNodeKind, number>>;
  };
}

export interface SubgraphExtractionQuery {
  countryCode: string;
  anchorNodeIds: string[];
  month: number;
  vehicleType?: '2WD' | '4WD';
  maxSlopePct?: number;
  maxDailyAscentM?: number;
  excludeNodeIds?: string[];
  perturbation?: {
    closedEdgeIds?: string[];
    closedNodeIds?: string[];
    edgeDelayMinutes?: Record<string, number>;
  };
  maxNodes?: number;
  maxHops?: number;
}

export interface SubgraphExtractionResult {
  subgraph: GlobalSpatiotemporalGraphSnapshot;
  prunedNodeIds: string[];
  cascadeDelayHints: Array<{
    edgeId: string;
    deltaMinutes: number;
    cause: string;
  }>;
}
