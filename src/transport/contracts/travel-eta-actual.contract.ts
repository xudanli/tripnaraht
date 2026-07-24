/**
 * ETA-L2-EXECUTION-ACTUAL-01 — Actual Duration SSOT + sample quality gate.
 *
 * Product question only:
 *   Did the planning reserve get contradicted by real execution?
 *
 * Frozen:
 *   elapsedDurationMin        = arrivedAt − departedAt
 *   excludedStopDurationMin   = sum of confirmed non-driving stops
 *   actualDrivingDurationMin  = elapsed − excluded
 *
 * VALID does NOT require a full GPS trace — user depart/arrive + stop declaration is enough.
 * Domestic drills prove the confirmation loop only — never Iceland L2 effectiveness.
 */

import type {
  OptionalLocationEvidenceV1,
  TravelEtaExecutionTravelEtaSnapshotV1,
} from './travel-eta-field-events.contract';

export const TRAVEL_ETA_ACTUAL_SCHEMA = 'tripnara/travel-eta-actual/v1' as const;

export type TravelEtaSampleQuality = 'VALID' | 'PARTIAL' | 'INVALID';

export type TravelEtaSampleSourceLabel =
  | 'INTERNAL_PILOT'
  | 'TEST_VEHICLE'
  | 'PARTNER_GUIDE'
  | 'VERIFIED_TRACK'
  | 'END_USER'
  | 'OTHER';

export type TravelEtaActualEvidenceSource =
  | 'USER_DEPARTURE_CONFIRMATION'
  | 'USER_ARRIVAL_CONFIRMATION'
  | 'USER_STOP_CONFIRMATION'
  | 'OPTIONAL_LOCATION_CHECK'
  | 'OPTIONAL_GPS_TRACE';

/**
 * Segment-level Actual result from execution confirmations.
 */
export interface SegmentActualResultV1 {
  schema: typeof TRAVEL_ETA_ACTUAL_SCHEMA;
  tripId: string;
  planVersionId: string;
  segmentId: string;

  departedAt: string;
  arrivedAt: string;

  elapsedDurationMin: number;
  excludedStopDurationMin: number;
  actualDrivingDurationMin: number;

  /** Alias for MAE pipelines that still read actualDurationMin */
  actualDurationMin: number;

  travelEtaSnapshot: TravelEtaExecutionTravelEtaSnapshotV1;

  sampleQuality: TravelEtaSampleQuality;
  qualityReasons: string[];

  evidenceSources: TravelEtaActualEvidenceSource[];
  optionalLocationEvidence?: OptionalLocationEvidenceV1;

  /** Optional pilot notes — weather / road / construction; never feed L2. */
  observationNotes?: string;
  sampleSource?: TravelEtaSampleSourceLabel;
}

/** @deprecated Prefer SegmentActualResultV1 for new capture paths. */
export interface TravelEtaActualCaptureV1 {
  schema: typeof TRAVEL_ETA_ACTUAL_SCHEMA;
  tripId: string;
  fromItemId?: string;
  toItemId?: string;
  segmentKey?: string;
  plannedRouteGeometryRef: string;
  actualDepartureAt: string;
  actualArrivalAt: string;
  actualDurationMin: number;
  actualDrivingDurationMin?: number;
  excludedStopDurationMin: number;
  elapsedDurationMin?: number;
  planningTravelEtaSnapshotRef?: string;
  planVersion?: string | number;
  routeDeviation: boolean;
  deviationDistanceM?: number;
  weatherObserved?: string;
  roadConditionObserved?: string;
  dataSource: 'GPS' | 'MOBILE_EXECUTION' | 'MANUAL_CONFIRMATION' | 'EXTERNAL_TRACK';
  sampleQuality: TravelEtaSampleQuality;
  qualityReasons?: string[];
  sampleSource: TravelEtaSampleSourceLabel;
  sampleSourceNote?: string;
}

export interface TravelEtaActualComputeInput {
  actualDepartureAt: string | Date;
  actualArrivalAt: string | Date;
  excludedStopDurationMin?: number;
}

export interface TravelEtaActualDurationsV1 {
  elapsedDurationMin: number;
  excludedStopDurationMin: number;
  actualDrivingDurationMin: number;
}

/**
 * Compute elapsed / excluded / net driving. Returns null if timestamps invalid or net ≤ 0.
 */
export function computeActualDurationsV1(
  input: TravelEtaActualComputeInput,
): TravelEtaActualDurationsV1 | null {
  const dep = new Date(input.actualDepartureAt).getTime();
  const arr = new Date(input.actualArrivalAt).getTime();
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return null;
  const elapsedDurationMin = Math.round((arr - dep) / 60_000);
  const excludedStopDurationMin = Math.max(0, Math.round(input.excludedStopDurationMin ?? 0));
  const actualDrivingDurationMin = elapsedDurationMin - excludedStopDurationMin;
  if (actualDrivingDurationMin <= 0) return null;
  return { elapsedDurationMin, excludedStopDurationMin, actualDrivingDurationMin };
}

export function computeActualDurationMin(input: TravelEtaActualComputeInput): number | null {
  return computeActualDurationsV1(input)?.actualDrivingDurationMin ?? null;
}

/**
 * Execution-actual quality gate (confirmation-first; GPS not required for VALID).
 */
export interface ExecutionActualQualityGateInput {
  hasDepartedAt: boolean;
  hasArrivedAt: boolean;
  hasTravelEtaSnapshot: boolean;
  reachedPlannedDestination: boolean;
  destinationChanged: boolean;
  routeMateriallyChanged: boolean;
  /** User said no stop, or confirmed stop duration(s). */
  nonDrivingStopsResolved: boolean;
  actualDrivingDurationMin: number | null;
  timestampsImplausible: boolean;
  segmentUniquelyBound: boolean;
  userMarkedInaccurate: boolean;

  /** PARTIAL signals */
  stopDurationUncertain?: boolean;
  arrivalBackfilled?: boolean;
  etaSnapshotPartial?: boolean;
  systemGuessWithoutFullUserConfirm?: boolean;
  mildRouteAdjustment?: boolean;
}

/**
 * Classify sample for MAE eligibility.
 * VALID → formal MAE; PARTIAL → observe only; INVALID → drop.
 * VALID does not require GPS.
 */
export function classifyExecutionActualSampleQuality(
  input: ExecutionActualQualityGateInput,
): { quality: TravelEtaSampleQuality; reasons: string[] } {
  const reasons: string[] = [];

  if (!input.hasDepartedAt || !input.hasArrivedAt) reasons.push('MISSING_DEPART_OR_ARRIVE');
  if (!input.hasTravelEtaSnapshot) reasons.push('MISSING_TRAVEL_ETA_SNAPSHOT');
  if (input.destinationChanged || !input.reachedPlannedDestination) {
    reasons.push('DESTINATION_CHANGED');
  }
  if (input.routeMateriallyChanged) reasons.push('ROUTE_MATERIALLY_CHANGED');
  if (!input.nonDrivingStopsResolved) reasons.push('UNRESOLVED_STOP');
  if (input.timestampsImplausible) reasons.push('TIMESTAMPS_IMPLAUSIBLE');
  if (input.actualDrivingDurationMin == null || input.actualDrivingDurationMin <= 0) {
    reasons.push('NON_POSITIVE_ACTUAL_DRIVING');
  }
  if (!input.segmentUniquelyBound) reasons.push('SEGMENT_NOT_UNIQUE');
  if (input.userMarkedInaccurate) reasons.push('USER_MARKED_INACCURATE');

  if (reasons.length > 0) {
    return { quality: 'INVALID', reasons };
  }

  const partialReasons: string[] = [];
  if (input.stopDurationUncertain) partialReasons.push('STOP_DURATION_UNCERTAIN');
  if (input.arrivalBackfilled) partialReasons.push('ARRIVAL_BACKFILLED');
  if (input.etaSnapshotPartial) partialReasons.push('ETA_SNAPSHOT_PARTIAL');
  if (input.systemGuessWithoutFullUserConfirm) {
    partialReasons.push('SYSTEM_GUESS_WITHOUT_FULL_CONFIRM');
  }
  if (input.mildRouteAdjustment) partialReasons.push('MILD_ROUTE_ADJUSTMENT');

  if (partialReasons.length > 0) {
    return { quality: 'PARTIAL', reasons: partialReasons };
  }

  return { quality: 'VALID', reasons: [] };
}

/** @deprecated Use classifyExecutionActualSampleQuality */
export type SampleQualityGateInput = {
  hasTrustedEndpoints: boolean;
  routeAlignedWithPlan: boolean;
  longNonDrivingStopUnresolved: boolean;
  provenanceComplete: boolean;
  dataSourceTrusted: boolean;
  destinationChanged: boolean;
  majorReroute: boolean;
  timestampsImplausible: boolean;
  providerUnknown: boolean;
  missingGeometry: boolean;
  shortStopEstimable?: boolean;
  partialGpsGap?: boolean;
  mildDeviation?: boolean;
  manualConfirmOnly?: boolean;
};

/** @deprecated Prefer classifyExecutionActualSampleQuality */
export function classifyTravelEtaSampleQuality(
  input: SampleQualityGateInput,
): { quality: TravelEtaSampleQuality; reasons: string[] } {
  return classifyExecutionActualSampleQuality({
    hasDepartedAt: input.hasTrustedEndpoints,
    hasArrivedAt: input.hasTrustedEndpoints,
    hasTravelEtaSnapshot: input.provenanceComplete && !input.providerUnknown && !input.missingGeometry,
    reachedPlannedDestination: !input.destinationChanged,
    destinationChanged: input.destinationChanged,
    routeMateriallyChanged: input.majorReroute,
    nonDrivingStopsResolved: !input.longNonDrivingStopUnresolved,
    actualDrivingDurationMin: 1,
    timestampsImplausible: input.timestampsImplausible,
    segmentUniquelyBound: true,
    userMarkedInaccurate: false,
    stopDurationUncertain: input.shortStopEstimable,
    mildRouteAdjustment: input.mildDeviation || !input.routeAlignedWithPlan,
    etaSnapshotPartial: !input.provenanceComplete,
    systemGuessWithoutFullUserConfirm: input.manualConfirmOnly || !input.dataSourceTrusted,
    arrivalBackfilled: input.partialGpsGap,
  });
}

export function isEligibleForMaeCalibration(quality: TravelEtaSampleQuality): boolean {
  return quality === 'VALID';
}
