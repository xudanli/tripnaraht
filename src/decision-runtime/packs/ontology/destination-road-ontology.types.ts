/**
 * RFC-002 — Destination pack route/road ontology contracts.
 */

export type RoadOntologyNodeKind = 'Region' | 'Corridor' | 'Road';

export interface DestinationRoadOntologyNode {
  ontologyNodeId: string;
  kind: RoadOntologyNodeKind;
  labelZh: string;
  labelEn: string;
  roadRefsZh?: string;
  roadIsKeys: string[];
  roadIds?: string[];
  regionCodes?: string[];
  segmentType?: 'HIGHWAY' | 'F_ROAD' | 'CITY';
  spatialSegmentId?: string;
  messageTriggersLower?: string[];
  tripDraftSignals?: string[];
}

export interface DestinationRoadOntologySpatialPoiSeed {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  closed?: boolean;
}

export interface DestinationRoadOntologySpatialSegmentSeed {
  id: string;
  from_poi_id: string;
  to_poi_id: string;
  segment_type: 'HIGHWAY' | 'F_ROAD' | 'CITY';
  ontologyNodeId?: string;
  rules?: Record<string, unknown>;
  seasonal_closures?: Array<{ start: string; end: string; reason?: string }>;
  road_condition?: { surface?: string; status?: string };
}

export interface DestinationRoadOntologyBundle {
  schemaId: string;
  countryCode: string;
  version: string;
  nodes: DestinationRoadOntologyNode[];
  spatialSeed?: {
    pois: DestinationRoadOntologySpatialPoiSeed[];
    segments: DestinationRoadOntologySpatialSegmentSeed[];
  };
}
