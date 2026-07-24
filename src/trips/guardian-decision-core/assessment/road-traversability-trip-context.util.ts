/**
 * Build traversability assessment from trip metadata + road assertion (T1).
 */

import { assessRoadTraversabilityForRoadId } from './road-traversability.assessor';
import type {
  DriverCapability,
  RoadSegmentCondition,
  RoadTraversabilityAssessment,
  VehicleCapability,
} from './road-traversability.types';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import { readWeatherConditionForTraversability } from './road-traversability-weather.util';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readVehicleCapabilityFromTripMetadata(
  metadata: Record<string, unknown>,
): VehicleCapability | null {
  const raw = asRecord(metadata.rfc001VehicleCapability);
  if (!raw?.driveType) return null;

  const driveType = String(raw.driveType).toUpperCase();
  if (driveType !== '2WD' && driveType !== 'AWD' && driveType !== '4WD') {
    return null;
  }

  return {
    driveType,
    vehicleClass: String(raw.vehicleClass ?? 'SMALL_CAR'),
    groundClearanceMm:
      typeof raw.groundClearanceMm === 'number' ? raw.groundClearanceMm : undefined,
    riverCrossingAllowed: raw.riverCrossingAllowed === true,
    rentalRestrictions: Array.isArray(raw.rentalRestrictions)
      ? raw.rentalRestrictions.map(String)
      : undefined,
  };
}

export function readDriverCapabilityFromTripMetadata(
  metadata: Record<string, unknown>,
): DriverCapability {
  const drill = asRecord(metadata.roadTraversabilityDrill);
  const vehicle = asRecord(metadata.rfc001VehicleCapability);
  return {
    gravelRoadExperience: vehicle?.gravelRoadExperience === true,
    snowDrivingExperience: vehicle?.snowDrivingExperience === true,
    acceptsRiverCrossing: vehicle?.riverCrossingAllowed === true,
  };
}

export function readWeatherConditionFromTripMetadata(
  metadata: Record<string, unknown>,
  opts?: { worldAssertions?: WorldStateAssertion[]; dayIndex?: number },
): import('./road-traversability.types').WeatherCondition {
  return readWeatherConditionForTraversability({
    tripMetadata: metadata,
    worldAssertions: opts?.worldAssertions,
    dayIndex: opts?.dayIndex,
  });
}

function roadAssertionToCondition(
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>,
): RoadSegmentCondition {
  const payload = assertion.payload;
  return {
    status: payload.status,
    condition: 'NORMAL',
    observedAt: assertion.observedAt,
    validUntil: assertion.validUntil,
    sourceProvider: assertion.source.provider,
  };
}

export function buildTraversabilityAssessmentForRoad(
  tripId: string,
  roadId: string,
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>,
  tripMetadata: Record<string, unknown>,
  destination?: string | null,
  opts?: { worldAssertions?: WorldStateAssertion[]; dayIndex?: number },
): RoadTraversabilityAssessment | null {
  const vehicle = readVehicleCapabilityFromTripMetadata(tripMetadata);
  if (!vehicle) return null;

  const country =
    resolveTripDestinationCountry(destination) ??
    resolveTripDestinationCountry(
      typeof tripMetadata.destination === 'string' ? tripMetadata.destination : undefined,
    ) ??
    'IS';

  return assessRoadTraversabilityForRoadId(roadId, {
    liveCondition: roadAssertionToCondition(assertion),
    weather: readWeatherConditionForTraversability({
      tripMetadata,
      worldAssertions: opts?.worldAssertions,
      dayIndex: opts?.dayIndex,
    }),
    vehicle,
    driverProfile: readDriverCapabilityFromTripMetadata(tripMetadata),
    tripContext: {
      tripId,
      destination: country,
    },
    destination: country,
  });
}
