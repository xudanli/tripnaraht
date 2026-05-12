import { projectRouteExecutionHazards } from './project-route-execution-hazards';
import { lookupTerrainVehicleExecutionState } from './terrain-vehicle-compatibility';

describe('route execution semantics (P4)', () => {
  it('projects F-road + sedan as BLOCKED with upgrade hint', () => {
    const r = projectRouteExecutionHazards({
      legId: 'leg-1',
      geometry: { coordinates: [] },
      elevationProfile: { samples: [] },
      weatherGrid: { samples: [] },
      roadCondition: { fRoad: true },
      vehicleProfile: { vehicleClass: 'SEDAN' },
      timeWindow: { startIso: '2026-01-02T08:00:00Z', endIso: '2026-01-02T18:00:00Z' },
      baselineDurationMin: 120,
    });
    expect(r.assessment.executionState).toBe('BLOCKED');
    expect(r.assessment.recommendedVehicleClass).toBe('SUV_4WD');
    expect(r.segments.length).toBe(1);
    expect(r.eta.expectedMinutes).toBeGreaterThanOrEqual(1);
  });

  it('segments corridor geometry into multiple hazard-local segments', () => {
    const coords = Array.from({ length: 40 }, (_, i) => ({
      lat: 64 + i * 0.001,
      lng: -21 + i * 0.001,
    }));
    const r = projectRouteExecutionHazards({
      legId: 'leg-2',
      geometry: { coordinates: coords },
      elevationProfile: {
        samples: Array.from({ length: 20 }, (_, i) => ({
          distanceM: i * 1000,
          elevationM: 100 + i * 2,
          gradePct: i === 10 ? 10 : 2,
        })),
      },
      weatherGrid: {
        samples: [
          { alongRatio: 0.1, crosswindRisk: 0.1 },
          { alongRatio: 0.85, crosswindRisk: 0.75 },
        ],
      },
      roadCondition: { fRoad: false },
      vehicleProfile: { vehicleClass: 'CAMPERVAN' },
      timeWindow: { startIso: '2026-01-02T08:00:00Z', endIso: '2026-01-02T18:00:00Z' },
      baselineDurationMin: 100,
      segmentCount: 4,
    });
    expect(r.segments.length).toBe(4);
    expect(r.assessment.weatherExposure.crosswindRisk).toBeGreaterThanOrEqual(0.75);
    expect(r.eta.pessimisticMinutes).toBeGreaterThanOrEqual(r.eta.optimisticMinutes);
  });

  it('exposes static terrain × vehicle matrix', () => {
    expect(lookupTerrainVehicleExecutionState('F_ROAD_WET_GRAVEL', 'SEDAN')).toBe('BLOCKED');
    expect(lookupTerrainVehicleExecutionState('HIGH_CROSSWIND_PASS', 'CAMPERVAN')).toBe('BLOCKED');
  });
});
