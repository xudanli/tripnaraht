import {
  assessRoadTraversability,
  assessRoadTraversabilityForRoadId,
  f208ReferenceProfile,
} from './road-traversability.assessor';
import type {
  DriverCapability,
  RoadSegmentCondition,
  RoadTraversabilityInput,
  TripExecutionContext,
  VehicleCapability,
  WeatherCondition,
} from './road-traversability.types';
import { ROAD_TRAVERSABILITY_CONSTRAINTS } from './road-traversability.types';

const tripContext: TripExecutionContext = {
  tripId: 'b0b88888-8888-4888-8888-888888888888',
  destination: 'IS',
};

function baseInput(overrides: {
  liveCondition: RoadSegmentCondition;
  vehicle: VehicleCapability;
  weather?: WeatherCondition;
  driverProfile?: DriverCapability;
}): RoadTraversabilityInput {
  return {
    roadProfile: f208ReferenceProfile(),
    liveCondition: overrides.liveCondition,
    weather: overrides.weather ?? { precipitation: 'none' },
    vehicle: overrides.vehicle,
    driverProfile: overrides.driverProfile ?? {},
    tripContext,
  };
}

const vehicle2wd: VehicleCapability = {
  driveType: '2WD',
  vehicleClass: 'COMPACT',
  riverCrossingAllowed: false,
};

const vehicle4wd: VehicleCapability = {
  driveType: '4WD',
  vehicleClass: 'LARGE_4X4',
  riverCrossingAllowed: true,
};

const limitedCondition: RoadSegmentCondition = {
  status: 'LIMITED',
  condition: 'NORMAL',
  observedAt: '2026-07-10T20:00:52Z',
  sourceProvider: 'vegagerdin_gagnaveita',
};

describe('assessRoadTraversability (RT-F208)', () => {
  it('RT-F208-001: LIMITED + 2WD → VEHICLE_INCOMPATIBLE / SUGGEST_REPLACE', () => {
    const result = assessRoadTraversability(
      baseInput({ liveCondition: limitedCondition, vehicle: vehicle2wd }),
    );
    expect(result.result).toBe('VEHICLE_INCOMPATIBLE');
    expect(result.gate).toBe('SUGGEST_REPLACE');
    expect(result.hardConstraints).toContain(
      ROAD_TRAVERSABILITY_CONSTRAINTS.F_ROAD_REQUIRES_4WD,
    );
  });

  it('RT-F208-002: LIMITED + LARGE_4X4 river OK → PASSABLE_WITH_CAUTION / NEED_CONFIRM', () => {
    const result = assessRoadTraversability(
      baseInput({ liveCondition: limitedCondition, vehicle: vehicle4wd }),
    );
    expect(result.result).toBe('PASSABLE_WITH_CAUTION');
    expect(result.gate).toBe('NEED_CONFIRM');
    expect(result.expectedSpeedKph).toBe(30);
  });

  it('RT-F208-003: LIMITED + rain + river + 4WD → TEMPORARILY_IMPASSABLE / SUGGEST_REPLACE', () => {
    const result = assessRoadTraversability(
      baseInput({
        liveCondition: limitedCondition,
        vehicle: vehicle4wd,
        weather: { precipitation: 'rain' },
      }),
    );
    expect(result.result).toBe('TEMPORARILY_IMPASSABLE');
    expect(result.gate).toBe('SUGGEST_REPLACE');
    expect(result.hardConstraints).toContain(
      ROAD_TRAVERSABILITY_CONSTRAINTS.RIVER_CROSSING_WEATHER_RISK,
    );
  });

  it('RT-F208-004: CLOSED + any vehicle → CLOSED / REJECT', () => {
    const result = assessRoadTraversability(
      baseInput({
        liveCondition: {
          status: 'CLOSED',
          condition: 'IMPASSABLE',
          observedAt: '2026-07-10T20:00:52Z',
          sourceProvider: 'vegagerdin_gagnaveita',
        },
        vehicle: vehicle2wd,
      }),
    );
    expect(result.result).toBe('CLOSED');
    expect(result.gate).toBe('REJECT');
    expect(result.hardConstraints).toContain(ROAD_TRAVERSABILITY_CONSTRAINTS.ROAD_CLOSED);
  });

  it('RT-F208-005: OPEN + gravel + 2WD no experience → DRIVER_INCOMPATIBLE / NEED_CONFIRM', () => {
    const result = assessRoadTraversability(
      baseInput({
        liveCondition: {
          status: 'OPEN',
          condition: 'LOOSE_GRAVEL',
          observedAt: '2026-07-10T20:00:52Z',
          sourceProvider: 'vegagerdin_gagnaveita',
        },
        vehicle: vehicle2wd,
        driverProfile: { gravelRoadExperience: false },
      }),
    );
    expect(result.result).toBe('DRIVER_INCOMPATIBLE');
    expect(result.gate).toBe('NEED_CONFIRM');
    expect(result.hardConstraints).toContain(
      ROAD_TRAVERSABILITY_CONSTRAINTS.GRAVEL_EXPERIENCE_REQUIRED,
    );
  });

  it('RT-PACK-001: assessRoadTraversabilityForRoadId resolves F208 from IS pack', () => {
    const result = assessRoadTraversabilityForRoadId('F208', {
      liveCondition: limitedCondition,
      weather: { precipitation: 'none' },
      vehicle: vehicle2wd,
      driverProfile: {},
      tripContext,
    });
    expect(result).not.toBeNull();
    expect(result!.result).toBe('VEHICLE_INCOMPATIBLE');
    expect(result!.gate).toBe('SUGGEST_REPLACE');
  });
});
