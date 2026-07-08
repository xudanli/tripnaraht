/**
 * Canonical Travel Graph — Travel Compiler 产物（v0）
 *
 * 行程级可推理图：节点 + 语义边 + 约束/依赖/证据。
 * 持久化建议：TripContextSnapshot.canonicalTravelGraph（JSONB 投影）。
 * @see internal-docs/product/travel-compiler-integration-v1.md
 */

import type { ResolutionMethod, ResolutionStatus } from '../../canonical-poi-resolution/types/canonical-poi.types';
import type { EvidenceRef } from '../../agent/interfaces/trip-plan.interface';

export const CANONICAL_TRAVEL_GRAPH_SCHEMA_ID = 'tripnara.canonical_travel_graph@v0';

export type TravelGraphNodeKind =
  | 'DAY'
  | 'POI'
  | 'ROUTE'
  | 'ROUTE_SEGMENT'
  | 'ACTIVITY'
  | 'STAY'
  | 'TRANSPORT'
  | 'BOOKING'
  | 'CONSTRAINT'
  | 'TIMELINE_SLOT';

export type TravelGraphEdgeKind =
  | 'CONTAINS'
  | 'AFTER'
  | 'BEFORE'
  | 'NEXT_DAY'
  | 'ON_ROUTE'
  | 'PART_OF_ROUTE'
  | 'REQUIRES'
  | 'REQUIRES_BOOKING'
  | 'REQUIRES_GUIDE'
  | 'REQUIRES_F_ROAD'
  | 'AFFECTED_BY_WEATHER'
  | 'AFFECTED_BY_ROAD'
  | 'STAY_AT'
  | 'SERVES_INTENT';

export type TravelIntentTag =
  | 'relax'
  | 'photography'
  | 'adventure'
  | 'culture'
  | 'food'
  | 'nature'
  | 'wellness'
  | 'transit'
  | 'sightseeing'
  | 'other';

export type CanonicalActivityType =
  | 'sightseeing'
  | 'spa'
  | 'wellness'
  | 'hiking'
  | 'ice_hiking'
  | 'photography'
  | 'museum'
  | 'food'
  | 'tour'
  | 'transit'
  | 'rest'
  | 'stay'
  | 'other';

export type CanonicalTransportMode =
  | 'drive'
  | 'walk'
  | 'bus'
  | 'flight'
  | 'ferry'
  | 'transit'
  | 'unknown';

export interface TravelGraphNodeRef {
  nodeId: string;
  kind: TravelGraphNodeKind;
}

export interface TravelGraphEdge {
  edgeId: string;
  kind: TravelGraphEdgeKind;
  from: TravelGraphNodeRef;
  to: TravelGraphNodeRef;
  confidence?: number;
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}

export interface CanonicalRef {
  /** CPRE Travel Primary Key，如 is.blue_lagoon */
  poiId?: string;
  /** RouteTemplate / RouteDirection 标识 */
  routeTemplateId?: string;
  routeDirectionId?: string;
  /** Place.id（DB 关联，可选） */
  placeId?: string;
  activityType?: CanonicalActivityType;
  transportMode?: CanonicalTransportMode;
}

export interface CanonicalizationRecord {
  rawText: string;
  canonical: CanonicalRef;
  status: ResolutionStatus | 'RESOLVED' | 'UNRESOLVED';
  confidence: number;
  method?: ResolutionMethod | 'ROUTE_TEMPLATE' | 'TAXONOMY' | 'HEURISTIC';
  evidenceRefs?: string[];
}

export interface TravelGraphNodeBase {
  nodeId: string;
  kind: TravelGraphNodeKind;
  label: string;
  dayIndex?: number;
  /** 关联 PlannerDraftSlot.slotId */
  sourceSlotId?: string;
  canonical?: CanonicalRef;
  canonicalization?: CanonicalizationRecord;
  intentTags?: TravelIntentTag[];
  evidenceRefs?: string[];
  metadata?: Record<string, unknown>;
}

export interface TravelGraphDayNode extends TravelGraphNodeBase {
  kind: 'DAY';
  dayIndex: number;
  date?: string;
}

export interface TravelGraphPoiNode extends TravelGraphNodeBase {
  kind: 'POI';
  poiId?: string;
  displayNames?: { zh?: string; en?: string; local?: string };
}

export interface TravelGraphRouteNode extends TravelGraphNodeBase {
  kind: 'ROUTE';
  routeTemplateId?: string;
  segmentNodeIds?: string[];
}

export interface TravelGraphRouteSegmentNode extends TravelGraphNodeBase {
  kind: 'ROUTE_SEGMENT';
  segmentId?: string;
  fromPoiId?: string;
  toPoiId?: string;
  distanceKm?: number;
  durationMin?: number;
  roadClass?: string;
  transportMode?: CanonicalTransportMode;
}

export interface TravelGraphActivityNode extends TravelGraphNodeBase {
  kind: 'ACTIVITY';
  activityType?: CanonicalActivityType;
  linkedPoiNodeId?: string;
}

export interface TravelGraphStayNode extends TravelGraphNodeBase {
  kind: 'STAY';
  checkInHint?: string;
  checkOutHint?: string;
  linkedPoiNodeId?: string;
}

export interface TravelGraphBookingNode extends TravelGraphNodeBase {
  kind: 'BOOKING';
  bookingKind?: 'ticket' | 'hotel' | 'tour' | 'rental_car' | 'ferry' | 'other';
  required: boolean;
  status?: 'unknown' | 'not_required' | 'required' | 'booked';
  linkedNodeId?: string;
}

export interface TravelGraphTimelineSlotNode extends TravelGraphNodeBase {
  kind: 'TIMELINE_SLOT';
  timeHint?: string;
  startWindow?: string;
  endWindow?: string;
}

export type TravelGraphNode =
  | TravelGraphDayNode
  | TravelGraphPoiNode
  | TravelGraphRouteNode
  | TravelGraphRouteSegmentNode
  | TravelGraphActivityNode
  | TravelGraphStayNode
  | TravelGraphBookingNode
  | TravelGraphTimelineSlotNode
  | TravelGraphNodeBase;

export interface TravelGraphDependency {
  dependencyId: string;
  kind: TravelGraphEdgeKind;
  subjectNodeId: string;
  objectRef: string;
  satisfied: boolean;
  reason?: string;
  evidenceRefs?: string[];
}

export interface TravelGraphConstraintRef {
  constraintId: string;
  source: 'compile' | 'travel_decision_contract' | 'destination_pack';
  severity: 'hard' | 'soft';
  code: string;
  message: string;
  affectedNodeIds?: string[];
  evidenceRefs?: string[];
}

export interface CanonicalTravelGraph {
  schemaId: typeof CANONICAL_TRAVEL_GRAPH_SCHEMA_ID;
  graphId: string;
  compileId: string;
  tripId?: string;
  requestId?: string;
  destination: {
    countryCode: string;
    region?: string;
  };
  createdAt: string;
  /** 编译时绑定的 Snapshot / Contract 版本（审计） */
  bindings?: {
    constraintsVersion?: number;
    snapshotRevision?: string;
  };
  days: TravelGraphDayNode[];
  nodes: TravelGraphNode[];
  edges: TravelGraphEdge[];
  dependencies: TravelGraphDependency[];
  constraints: TravelGraphConstraintRef[];
  bookings: TravelGraphBookingNode[];
  evidenceCatalog: EvidenceRef[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    poiResolved: number;
    poiUnresolved: number;
    routeTemplatesResolved: number;
    routeTemplatesTotal: number;
    routeSegmentsResolved: number;
    routeSegmentsTotal: number;
    bookingRequired: number;
    dependencySatisfied: number;
    dependencyTotal: number;
  };
}
