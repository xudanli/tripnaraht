/**
 * Canonical world-state snapshot — one snapshotId per Decision Run.
 * Production and decision-lab share this contract.
 * @see ADR-007-Decision-Runtime-v2.md
 *
 * Product alias: {@link TravelWorldStateSnapshot} (Authority Consistency).
 */

import type { SourceVersion } from './evidence-reference';
import type {
  CompletenessLevel,
  WorldStateCompleteness,
} from '../constraints/contracts/world-state-completeness';
import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';

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

/** Rule-based inferred state (not raw facts) — strong-wind vertical slice fields. */
export interface TravelWorldInferredState {
  estimatedArrival?: string;
  missProbability?: number;
  scheduleSlackMinutes?: number;
  interventionDeadline?: string;
  vehicleRoadFit?: 'FIT' | 'MISMATCH' | 'UNKNOWN';
  riskTrend?: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
  evidence?: string[];
  confidence?: number;
}

export interface VehicleSnapshotState {
  vehicleClass?: string;
  drivetrain?: string;
  highRoof?: boolean;
}

/**
 * Canonical snapshot bound for the full Decision Run.
 * Invariants:
 * - One snapshotId per run; no mid-run mutation
 * - Decision / Solver / Verification consume the same snapshotId
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

  /** Optional TravelWorldFact binding (Authority Consistency). */
  worldFacts?: TravelWorldFact[];
  /** Optional vehicle binding. */
  vehicle?: VehicleSnapshotState;
  /** Facts vs inferred: inferred never replaces authoritative facts. */
  inferred?: TravelWorldInferredState;
}

/**
 * Product name for the unified Decision-Run world snapshot.
 * Same object as {@link CanonicalWorldStateSnapshot} — do not fork a third type.
 */
export type TravelWorldStateSnapshot = CanonicalWorldStateSnapshot;

export const TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA =
  'tripnara.canonical_world_state_snapshot@v1' as const;
