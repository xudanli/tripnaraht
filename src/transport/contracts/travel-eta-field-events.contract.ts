/**
 * ETA-L2-EXECUTION-ACTUAL-01 — execution confirmation events (not navigation).
 *
 * P0 only:
 *   SEGMENT_DEPARTED | SEGMENT_ARRIVED | NON_DRIVING_STOP_RECORDED
 *
 * GPS is optional evidence enhancement — never required for the Actual loop.
 */

export const TRAVEL_ETA_EXECUTION_EVENT_SCHEMA =
  'tripnara/travel-eta-execution-event/v1' as const;

/** @deprecated Use TRAVEL_ETA_EXECUTION_EVENT_SCHEMA */
export const TRAVEL_ETA_FIELD_EVENT_SCHEMA = TRAVEL_ETA_EXECUTION_EVENT_SCHEMA;

export type TravelEtaExecutionConfirmationSource =
  | 'USER_TAP'
  | 'EXECUTION_ACTION'
  | 'SYSTEM_SUGGESTED_USER_CONFIRMED';

export type TravelEtaExecutionTravelEtaSnapshotV1 = {
  baseDurationMin: number;
  planningDurationMin: number;
  uncertaintyMin?: number;
  confidence: number;
  provider: string;
  adjustments: Array<{ type: string; durationDeltaMin: number }>;
  geometryRef?: string;
  calculatedAt: string;
};

export type SegmentDepartedEventV1 = {
  schema: typeof TRAVEL_ETA_EXECUTION_EVENT_SCHEMA;
  eventType: 'SEGMENT_DEPARTED';
  eventId: string;
  tripId: string;
  planVersionId: string;
  segmentId: string;
  occurredAt: string;
  /** Frozen at departure — later ETA/rule changes must not overwrite. */
  travelEtaSnapshot: TravelEtaExecutionTravelEtaSnapshotV1;
  confirmationSource: TravelEtaExecutionConfirmationSource;
};

export type SegmentArrivedEventV1 = {
  schema: typeof TRAVEL_ETA_EXECUTION_EVENT_SCHEMA;
  eventType: 'SEGMENT_ARRIVED';
  eventId: string;
  tripId: string;
  planVersionId: string;
  segmentId: string;
  occurredAt: string;
  confirmationSource: TravelEtaExecutionConfirmationSource;
  /** User-declared assessment — not automated reroute detection. */
  arrivalAssessment?: {
    reachedPlannedDestination?: boolean;
    routeMateriallyChanged?: boolean;
  };
};

export type NonDrivingStopReason =
  | 'MEAL'
  | 'SIGHTSEEING'
  | 'SHOPPING'
  | 'FUEL'
  | 'REST'
  | 'OTHER';

export type NonDrivingStopRecordedEventV1 = {
  schema: typeof TRAVEL_ETA_EXECUTION_EVENT_SCHEMA;
  eventType: 'NON_DRIVING_STOP_RECORDED';
  eventId: string;
  tripId: string;
  segmentId: string;
  startedAt?: string;
  endedAt?: string;
  durationMin: number;
  reason: NonDrivingStopReason;
  source: 'USER_RECORDED' | 'POST_ARRIVAL_CONFIRMATION' | 'OPTIONAL_GPS_SUGGESTION';
};

export type TravelEtaExecutionEventV1 =
  | SegmentDepartedEventV1
  | SegmentArrivedEventV1
  | NonDrivingStopRecordedEventV1;

export type TravelEtaExecutionEventType = TravelEtaExecutionEventV1['eventType'];

export const P0_EXECUTION_EVENT_TYPES: readonly TravelEtaExecutionEventType[] = [
  'SEGMENT_DEPARTED',
  'SEGMENT_ARRIVED',
  'NON_DRIVING_STOP_RECORDED',
] as const;

/** Only departure freezes the planning snapshot the user saw. */
export function executionEventRequiresEtaSnapshot(
  type: TravelEtaExecutionEventType,
): boolean {
  return type === 'SEGMENT_DEPARTED';
}

/** @deprecated Use executionEventRequiresEtaSnapshot */
export const fieldEventRequiresEtaSnapshot = executionEventRequiresEtaSnapshot;

/** Optional GPS / location — enhancement only, never P0 dependency. */
export type OptionalLocationEvidenceV1 = {
  departureNearOrigin?: boolean;
  arrivalNearDestination?: boolean;
  suspectedStopDurationMin?: number;
  confidence?: number;
};
