/**
 * Road segment static profiles — ADR-ROAD-TRAVERSABILITY-MODEL § Type Contracts.
 */

export type RoadClass =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'HIGHLAND_F_ROAD'
  | 'LOCAL'
  | 'TRACK';

export type SurfaceType =
  | 'PAVED'
  | 'GRAVEL'
  | 'MIXED'
  | 'UNPAVED'
  | 'UNKNOWN';

export type TerrainType =
  | 'LOWLAND'
  | 'MOUNTAIN'
  | 'HIGHLAND'
  | 'COASTAL'
  | 'GLACIAL_RIVER';

export interface RoadSegmentProfile {
  roadId: string;
  segmentId: string;
  roadClass: RoadClass;
  surfaceType: SurfaceType;
  terrainType: TerrainType;
  requires4wd: boolean;
  minVehicleClass?: string;
  hasUnbridgedRiver: boolean;
  riverCrossingCount?: number;
  typicalSpeedKph?: number;
  winterServiceLevel?: string;
}

export interface RoadSegmentProfileBundle {
  schemaId: 'tripnara.road_segment_profiles@v1';
  countryCode: string;
  version: string;
  roadRegions: Record<string, string[]>;
  profiles: RoadSegmentProfile[];
}
