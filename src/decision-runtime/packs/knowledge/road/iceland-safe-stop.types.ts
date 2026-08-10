/**
 * Curated Iceland safe-stop / pull-off catalog for drive runbooks.
 */

import type { SourceReference } from '../iceland-knowledge.types';

export type IcelandSafeStopKind =
  | 'FUEL_SERVICES'
  | 'ATTRACTION_PARKING'
  | 'HIGHLAND_TRAILHEAD'
  | 'REST_AREA'
  | 'OTHER';

export type IcelandSafeStopAmenity =
  | 'PARKING'
  | 'TOILET'
  | 'FUEL'
  | 'REST_AREA'
  | 'CAMPING'
  | 'FOOD'
  | 'WATER';

export interface IcelandSafeStop {
  poiId: string;
  name: string;
  lat: number;
  lng: number;
  kind: IcelandSafeStopKind;
  amenities: IcelandSafeStopAmenity[];
  roadIds: string[];
  corridorTags: string[];
  reliability: 'PACK_CURATED' | 'PLACE_PROJECTED' | 'UNKNOWN';
  sourceRefs: SourceReference[];
}

export interface IcelandSafeStopCatalog {
  schemaId: 'tripnara.iceland.safe_stop_catalog@v1';
  version: string;
  country: 'IS';
  notes?: string;
  stops: IcelandSafeStop[];
}

export interface ResolveIcelandSafeStopInput {
  lat?: number;
  lng?: number;
  roadId?: string;
  /** Prefer these corridor tags when ranking. */
  corridorTags?: string[];
  /** Max distance km when lat/lng provided (default 80). */
  maxDistanceKm?: number;
}

export interface IcelandSafeStopHit {
  stop: IcelandSafeStop;
  distanceKm?: number;
  matchReason: 'EXPLICIT_ID' | 'ROAD_ID' | 'CORRIDOR' | 'NEAREST';
}
