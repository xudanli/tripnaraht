/**
 * Canonical world-state snapshot — one snapshotId per Decision Run.
 * Production and decision-lab share this contract.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { SourceVersion } from './evidence-reference';
import type {
  CompletenessLevel,
  WorldStateCompleteness,
} from '../constraints/contracts/world-state-completeness';

export type DataCompleteness = CompletenessLevel;

export interface WeatherState {
  date: string;
  locationId?: string;
  condition?: string;
  temperatureC?: number;
  windSpeedMs?: number;
  precipitationMm?: number;
  alertLevel?: string;
  sourceRef?: string;
}

export interface RoadState {
  roadId: string;
  segmentId?: string;
  status: 'OPEN' | 'CLOSED' | 'RESTRICTED' | 'UNKNOWN';
  reasonCode?: string;
  validFrom?: string;
  validUntil?: string;
  sourceRef?: string;
}

export interface HazardState {
  hazardId: string;
  type: string;
  severity?: string;
  geometryRef?: string;
  validFrom?: string;
  validUntil?: string;
  sourceRef?: string;
}

export interface FerryState {
  ferryId: string;
  routeId?: string;
  status: 'OPERATING' | 'CANCELLED' | 'DELAYED' | 'UNKNOWN';
  validFrom?: string;
  validUntil?: string;
  sourceRef?: string;
}

export interface PoiOperationalState {
  poiId: string;
  open?: boolean;
  openingHoursRef?: string;
  reservationRequired?: boolean;
  validFrom?: string;
  validUntil?: string;
  sourceRef?: string;
}

/** Sparse travel-time matrix keyed by origin/destination pair id */
export interface TravelTimeMatrix {
  matrixId: string;
  entries: Array<{
    fromId: string;
    toId: string;
    mode: string;
    durationMinutes: number;
    distanceKm?: number;
    sourceRef?: string;
  }>;
}

/**
 * Canonical snapshot bound for the full Decision Run.
 * Invariants:
 * - One snapshotId per run; no mid-run mutation
 * - All strategies consume the same snapshot
 * - completeness MISSING ≠ "no problems"
 */
export interface CanonicalWorldStateSnapshot {
  schemaId: 'tripnara.canonical_world_state_snapshot@v1';
  snapshotId: string;
  tripId: string;
  revision: string;
  createdAt: string;

  weather: WeatherState[];
  roads: RoadState[];
  hazards: HazardState[];
  ferries: FerryState[];
  poiStates: PoiOperationalState[];
  travelMatrix: TravelTimeMatrix;

  completeness: WorldStateCompleteness;
  sourceVersions: SourceVersion[];

  /** RFC-001 assertion ids when bridged from guardian store */
  assertionIds?: string[];
}
