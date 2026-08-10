import type {
  LookDrivetrain,
  ObservationContext,
  ObservationFact,
  TravelObservationEvent,
  VerificationStatus,
} from '../observation.types';

/** Optional S3 inputs until live Trip/Road providers are wired */
export interface GroundingHints {
  vehicleId?: string;
  vehicleClass?: string;
  drivetrain?: LookDrivetrain;
  nearbyRoadIds?: string[];
  /** Roads on the current day plan (e.g. F208) */
  plannedRoadIds?: string[];
  /** Explicit: day plan includes F-road / highland segment */
  plannedRequiresFroad?: boolean;
  roadStatuses?: Record<
    string,
    {
      isOpen: boolean;
      riskLevel?: 0 | 1 | 2 | 3;
      updatedAt: string;
      source?: string;
    }
  >;
  bookingId?: string;
  bookingMeetingPointName?: string;
  bookingOperatorName?: string;
  /** Local wall-clock for parking window checks (ISO) */
  localTimeIso?: string;
  /** Optional official / municipal parking snapshot */
  officialParking?: {
    allowsNow: boolean;
    paidRequired?: boolean;
    validUntil?: string;
    reason?: string;
    updatedAt?: string;
    source?: string;
  };
  /** RealityOS P0-B rental evidence package hints */
  rentalHandover?: import('../rental/rental-evidence.types').RentalHandoverHints;
}

export type RoadMatchKind =
  | 'MATCHED'
  | 'UNMATCHED'
  | 'CONFLICT'
  | 'NO_GPS'
  | 'NO_ROAD_ID';

export type VehicleRoadFitKind = 'FIT' | 'MISMATCH' | 'UNKNOWN';

export type MeetingPointKind = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

export interface GroundingResult {
  context: ObservationContext;
  verificationStatus: VerificationStatus;
  facts: ObservationFact[];
  roadMatch: RoadMatchKind;
  detectedRoadId?: string;
  vehicleRoadFit: VehicleRoadFitKind;
  meetingPoint: MeetingPointKind;
  officialRoadOpen?: boolean;
  roadStatusUpdatedAt?: string;
  notes: string[];
  /** GRD-FR-008 — stable hash of grounding inputs */
  contextHash: string;
  /** Parking P0-A */
  parkingFit?: import('./parking-rules').ParkingFitKind;
  parkingValidUntil?: string;
  parkingPaidRequired?: boolean;
}

export function extractDetectedRoadId(
  event: TravelObservationEvent,
): string | undefined {
  const froad = event.observations.find(
    (o) => o.semanticKey === 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
  );
  if (froad && typeof froad.value === 'string') return froad.value.toUpperCase();
  if (froad && froad.value === true) {
    // Heuristic may only set boolean — try OCR text in extraction meta uncertainties
    return undefined;
  }
  return undefined;
}

export function extractDetectedDrivetrain(
  event: TravelObservationEvent,
): LookDrivetrain | undefined {
  const d = event.observations.find(
    (o) => o.semanticKey === 'OBSERVATION.VEHICLE.DRIVETRAIN_DETECTED',
  );
  if (d?.value === '2WD' || d?.value === '4WD') return d.value;
  const unknown = event.observations.find(
    (o) => o.semanticKey === 'DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN',
  );
  if (unknown) return 'UNKNOWN';
  return undefined;
}

export function extractOperatorName(
  event: TravelObservationEvent,
): string | undefined {
  const op = event.observations.find(
    (o) => o.semanticKey === 'OBSERVATION.ACTIVITY.OPERATOR_SIGN_DETECTED',
  );
  return typeof op?.value === 'string' ? op.value : undefined;
}
