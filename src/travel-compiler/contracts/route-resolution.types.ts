/**
 * CTRE Module 2 — Route Resolution types
 */

import type { CanonicalTransportMode } from '../contracts/canonical-travel-graph.types';

export type RouteResolutionStatus = 'UNRESOLVED' | 'MATCHED' | 'VERIFIED' | 'ROUTE_NOT_FOUND';

export type RouteRoadClass = 'primary' | 'ring-road' | 'f-road' | 'gravel' | 'unknown';

export interface RouteTemplateSegmentDef {
  segmentId: string;
  fromPoiId: string;
  toPoiId: string;
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  durationMin: number;
  roadClass?: RouteRoadClass;
  transportMode: CanonicalTransportMode;
  seasonRisk?: 'low' | 'medium' | 'high';
  weatherRisk?: 'low' | 'medium' | 'high';
}

export interface RouteTemplateDef {
  routeTemplateId: string;
  countryCode: string;
  label: string;
  aliases: RegExp[];
  /** Ordered waypoint POI ids (Travel Primary Keys) */
  waypointPoiIds: string[];
  waypointLabels: string[];
  segments: RouteTemplateSegmentDef[];
  evidenceSource: string;
}

export interface RouteTemplateMatch {
  template: RouteTemplateDef;
  matchedText: string;
  confidence: number;
}

export interface RouteResolutionStats {
  templatesMatched: number;
  templatesTotal: number;
  segmentsAdded: number;
  waypointPoisAdded: number;
}
