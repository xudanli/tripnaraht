import type {
  LookDrivetrain,
  ObservationContext,
  TravelObservationEvent,
} from '../observation.types';
import type { GroundingHints } from './grounding.types';
import { extractDetectedDrivetrain } from './grounding.types';

/**
 * Build ObservationContext from event + grounding hints.
 * Resolution order for drivetrain (Q3):
 * hints/intake → VehicleClass map → image → UNKNOWN
 */
export function buildObservationContext(
  event: TravelObservationEvent,
  hints: GroundingHints = {},
): ObservationContext {
  const hasGps =
    typeof event.spatialContext.latitude === 'number' &&
    typeof event.spatialContext.longitude === 'number';

  const drivetrain = resolveDrivetrain(event, hints);
  const vehicleClass =
    hints.vehicleClass ??
    inferClassFromFacts(event) ??
    (drivetrain === '4WD' ? 'SUV_4WD' : 'UNKNOWN');

  return {
    trip: {
      tripId: event.tripId,
      phase: 'TRAVELING',
      dayIndex: event.dayIndex ?? 0,
    },
    spatial: {
      location: hasGps
        ? {
            latitude: event.spatialContext.latitude!,
            longitude: event.spatialContext.longitude!,
            accuracyMeters: event.spatialContext.accuracyMeters,
          }
        : undefined,
      heading: event.spatialContext.heading,
      nearbyRoadIds: [...(hints.nearbyRoadIds ?? [])],
      nearbyPoiIds: [],
    },
    temporal: {
      localTime: event.capturedAt,
      capturedAt: event.capturedAt,
    },
    vehicle:
      hints.vehicleId || hints.vehicleClass || hints.drivetrain || vehicleClass !== 'UNKNOWN'
        ? {
            vehicleId: hints.vehicleId ?? event.tripContext.vehicleId ?? 'unknown',
            vehicleClass,
            drivetrain,
          }
        : undefined,
    execution: {
      currentActivityId: event.tripContext.currentActivityId,
      nextActivityId: event.tripContext.nextActivityId,
      bookingId: hints.bookingId ?? event.tripContext.bookingId,
    },
    externalEvidence: {},
  };
}

function resolveDrivetrain(
  event: TravelObservationEvent,
  hints: GroundingHints,
): LookDrivetrain {
  if (hints.drivetrain && hints.drivetrain !== 'UNKNOWN') {
    return hints.drivetrain;
  }
  if (hints.vehicleClass === 'SUV_4WD') return '4WD';
  if (hints.vehicleClass === 'SEDAN') return '2WD';
  const fromImage = extractDetectedDrivetrain(event);
  if (fromImage && fromImage !== 'UNKNOWN') return fromImage;
  if (hints.drivetrain === 'UNKNOWN') return 'UNKNOWN';
  return fromImage ?? 'UNKNOWN';
}

function inferClassFromFacts(event: TravelObservationEvent): string | undefined {
  const c = event.observations.find(
    (o) => o.semanticKey === 'OBSERVATION.VEHICLE.CLASS_DETECTED',
  );
  return typeof c?.value === 'string' ? c.value : undefined;
}
