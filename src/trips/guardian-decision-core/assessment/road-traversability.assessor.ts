/**
 * Pure road traversability assessment — ADR-ROAD-TRAVERSABILITY-MODEL.
 *
 * T1: consumed by Abu LIMITED branch + traversability drill; no IO.
 */

import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../../decision-runtime/packs/road/road-segment-profile.loader';
import type { RoadSegmentProfile } from '../../../decision-runtime/packs/road/road-segment-profile.types';
import {
  ROAD_TRAVERSABILITY_CONSTRAINTS,
  type RoadSegmentCondition,
  type RoadTraversabilityAssessment,
  type RoadTraversabilityInput,
  type VehicleCapability,
  type WeatherCondition,
} from './road-traversability.types';

export const ROAD_TRAVERSABILITY_ASSESSOR_VERSION = 'road-traversability-assessor@0.1.0';

function isFourWheelDrive(vehicle: VehicleCapability): boolean {
  return vehicle.driveType === '4WD';
}

function meetsMinVehicleClass(vehicle: VehicleCapability, minClass?: string): boolean {
  if (!minClass) return true;
  if (minClass === 'LARGE_4X4') {
    return vehicle.vehicleClass === 'LARGE_4X4' || isFourWheelDrive(vehicle);
  }
  return true;
}

function hasWetPrecipitation(weather: WeatherCondition): boolean {
  return weather.precipitation === 'rain' || weather.precipitation === 'snow';
}

function isSurfaceImpassable(condition: RoadSegmentCondition): boolean {
  return (
    condition.status === 'CLOSED' ||
    condition.condition === 'IMPASSABLE' ||
    condition.condition === 'FLOODED'
  );
}

function isDataGap(input: RoadTraversabilityInput): boolean {
  return (
    input.liveCondition.status === 'UNKNOWN' ||
    input.liveCondition.condition === 'UNKNOWN' ||
    input.roadProfile.surfaceType === 'UNKNOWN'
  );
}

function vehicleIncompatibleWithProfile(
  profile: RoadSegmentProfile,
  vehicle: VehicleCapability,
): string | null {
  if (profile.requires4wd && !isFourWheelDrive(vehicle)) {
    return ROAD_TRAVERSABILITY_CONSTRAINTS.F_ROAD_REQUIRES_4WD;
  }
  if (!meetsMinVehicleClass(vehicle, profile.minVehicleClass)) {
    return ROAD_TRAVERSABILITY_CONSTRAINTS.VEHICLE_CLASS_INSUFFICIENT;
  }
  return null;
}

function riverCrossingBlocked(
  profile: RoadSegmentProfile,
  vehicle: VehicleCapability,
  weather: WeatherCondition,
  condition: RoadSegmentCondition,
): { blocked: boolean; weatherRisk: boolean; contractBlocked: boolean } {
  if (!profile.hasUnbridgedRiver) {
    return { blocked: false, weatherRisk: false, contractBlocked: false };
  }
  const contractBlocked = !vehicle.riverCrossingAllowed;
  const wetSurface =
    hasWetPrecipitation(weather) ||
    condition.condition === 'WET' ||
    condition.condition === 'FLOODED';
  const weatherRisk = wetSurface && profile.hasUnbridgedRiver;
  return {
    blocked: contractBlocked || weatherRisk,
    weatherRisk,
    contractBlocked,
  };
}

function buildAssessment(
  partial: Omit<RoadTraversabilityAssessment, 'evidenceRefs'> & {
    evidenceRefs?: string[];
  },
): RoadTraversabilityAssessment {
  return {
    evidenceRefs: partial.evidenceRefs ?? [],
    ...partial,
  };
}

/**
 * Assess whether a bound road segment is traversable for the given vehicle/driver/weather.
 */
export function assessRoadTraversability(
  input: RoadTraversabilityInput,
): RoadTraversabilityAssessment {
  const { roadProfile, liveCondition, weather, vehicle, driverProfile } = input;
  const baseSpeed = roadProfile.typicalSpeedKph;

  if (isDataGap(input)) {
    return buildAssessment({
      result: 'UNKNOWN',
      gate: 'REJECT',
      hardConstraints: [ROAD_TRAVERSABILITY_CONSTRAINTS.ROAD_DATA_GAP],
      risks: ['Profile or live condition incomplete — fail-closed'],
      expectedSpeedKph: undefined,
    });
  }

  if (isSurfaceImpassable(liveCondition)) {
    return buildAssessment({
      result: 'CLOSED',
      gate: 'REJECT',
      hardConstraints: [ROAD_TRAVERSABILITY_CONSTRAINTS.ROAD_CLOSED],
      risks: ['Road segment closed or impassable'],
      expectedSpeedKph: 0,
    });
  }

  const vehicleMismatch = vehicleIncompatibleWithProfile(roadProfile, vehicle);
  const river = riverCrossingBlocked(roadProfile, vehicle, weather, liveCondition);

  if (liveCondition.status === 'LIMITED') {
    if (vehicleMismatch) {
      return buildAssessment({
        result: 'VEHICLE_INCOMPATIBLE',
        gate: 'SUGGEST_REPLACE',
        hardConstraints: [vehicleMismatch],
        risks: ['LIMITED passage requires capable vehicle for this surface'],
        expectedSpeedKph: 0,
      });
    }

    if (river.blocked) {
      const hardConstraints = [
        ...(river.contractBlocked
          ? [ROAD_TRAVERSABILITY_CONSTRAINTS.RIVER_CROSSING_NOT_ALLOWED]
          : []),
        ...(river.weatherRisk
          ? [ROAD_TRAVERSABILITY_CONSTRAINTS.RIVER_CROSSING_WEATHER_RISK]
          : []),
      ];
      return buildAssessment({
        result: 'TEMPORARILY_IMPASSABLE',
        gate: 'SUGGEST_REPLACE',
        hardConstraints,
        risks: ['River crossing risk elevated under current conditions'],
        expectedSpeedKph: 0,
      });
    }

    return buildAssessment({
      result: 'PASSABLE_WITH_CAUTION',
      gate: 'NEED_CONFIRM',
      hardConstraints: [],
      risks: ['Restricted passage — confirm vehicle and conditions before proceeding'],
      expectedSpeedKph: baseSpeed ? Math.round(baseSpeed * 0.75) : undefined,
    });
  }

  if (
    liveCondition.status === 'OPEN' &&
    (roadProfile.surfaceType === 'GRAVEL' || liveCondition.condition === 'LOOSE_GRAVEL') &&
    !driverProfile.gravelRoadExperience &&
    vehicle.driveType === '2WD'
  ) {
    return buildAssessment({
      result: 'DRIVER_INCOMPATIBLE',
      gate: 'NEED_CONFIRM',
      hardConstraints: [ROAD_TRAVERSABILITY_CONSTRAINTS.GRAVEL_EXPERIENCE_REQUIRED],
      risks: ['Gravel surface without declared driver experience'],
      expectedSpeedKph: baseSpeed ? Math.round(baseSpeed * 0.85) : undefined,
    });
  }

  if (vehicleMismatch) {
    return buildAssessment({
      result: 'VEHICLE_INCOMPATIBLE',
      gate: 'SUGGEST_REPLACE',
      hardConstraints: [vehicleMismatch],
      risks: ['Vehicle does not meet road profile requirements'],
      expectedSpeedKph: 0,
    });
  }

  if (river.weatherRisk) {
    return buildAssessment({
      result: 'TEMPORARILY_IMPASSABLE',
      gate: 'SUGGEST_REPLACE',
      hardConstraints: [ROAD_TRAVERSABILITY_CONSTRAINTS.RIVER_CROSSING_WEATHER_RISK],
      risks: ['River crossing not advisable in current weather'],
      expectedSpeedKph: 0,
    });
  }

  return buildAssessment({
    result: 'PASSABLE',
    gate: 'ALLOW',
    hardConstraints: [],
    risks: [],
    expectedSpeedKph: baseSpeed,
  });
}

/** Resolve pack profile then assess — convenience for evaluate path (T1). */
export function assessRoadTraversabilityForRoadId(
  roadId: string,
  input: Omit<RoadTraversabilityInput, 'roadProfile'> & { destination?: string },
): RoadTraversabilityAssessment | null {
  const country = input.destination ?? input.tripContext.destination;
  const bundle = loadRoadSegmentProfilesForCountry(country);
  if (!bundle) return null;
  const profile = resolveRoadSegmentProfile(roadId, bundle);
  if (!profile) return null;
  return assessRoadTraversability({ ...input, roadProfile: profile });
}

/** Frozen F208 reference profile for acceptance / drill fixtures. */
export function f208ReferenceProfile(): RoadSegmentProfile {
  return {
    roadId: 'F208',
    segmentId: 'seg-is-f208',
    roadClass: 'HIGHLAND_F_ROAD',
    surfaceType: 'GRAVEL',
    terrainType: 'HIGHLAND',
    requires4wd: true,
    hasUnbridgedRiver: true,
    riverCrossingCount: 1,
    typicalSpeedKph: 40,
    winterServiceLevel: 'SEASONAL',
  };
}
