import { projectRouteExecutionHazards } from './project-route-execution-hazards';
import { buildExecutionEnrichedTravelLeg } from './build-execution-enriched-travel-leg';
import { routeExecutionToTemporalDrifts } from './route-execution-temporal-bridge';
import type { TravelLeg } from '../../decision/world-model';

describe('routeExecutionToTemporalDrifts', () => {
  it('maps corridor shift to PROPAGATE_SEQUENCE when ETA exceeds baseline', () => {
    const base: TravelLeg = {
      mode: 'drive',
      from: { lat: 64.1, lng: -21.9 },
      to: { lat: 64.2, lng: -21.8 },
      durationMin: 60,
    };
    const proj = projectRouteExecutionHazards({
      legId: 'slot-a',
      geometry: { coordinates: [base.from, base.to] },
      elevationProfile: { samples: [] },
      weatherGrid: {
        samples: [{ alongRatio: 0.5, crosswindRisk: 0.38 }],
      },
      roadCondition: { fRoad: false },
      vehicleProfile: { vehicleClass: 'SUV_4WD' },
      timeWindow: { startIso: '2026-06-01T06:00:00Z', endIso: '2026-06-01T22:00:00Z' },
      baselineDurationMin: 60,
    });
    const enriched = buildExecutionEnrichedTravelLeg(base, proj);
    const drifts = routeExecutionToTemporalDrifts({
      date: '2026-06-01',
      sourceSlotId: 'slot-a',
      enriched,
    });
    const seq = drifts.find(d => d.propagationPolicy === 'PROPAGATE_SEQUENCE');
    expect(seq?.cause.kind).toBe('ROUTE_EXECUTION_PHYSICS');
    expect(seq?.deltaMinutes).toBeGreaterThanOrEqual(1);
  });

  it('emits NO_PROPAGATION advisory when corridor execution is BLOCKED', () => {
    const base: TravelLeg = {
      mode: 'drive',
      from: { lat: 64.1, lng: -21.9 },
      to: { lat: 64.2, lng: -21.8 },
      durationMin: 120,
    };
    const proj = projectRouteExecutionHazards({
      legId: 'slot-b',
      geometry: {},
      elevationProfile: { samples: [] },
      weatherGrid: { samples: [] },
      roadCondition: { fRoad: true },
      vehicleProfile: { vehicleClass: 'SEDAN' },
      timeWindow: { startIso: '2026-06-01T06:00:00Z', endIso: '2026-06-01T22:00:00Z' },
      baselineDurationMin: 120,
    });
    const enriched = buildExecutionEnrichedTravelLeg(base, proj);
    const drifts = routeExecutionToTemporalDrifts({
      date: '2026-06-01',
      sourceSlotId: 'slot-b',
      enriched,
    });
    expect(drifts[0]?.propagationPolicy).toBe('NO_PROPAGATION');
    expect(drifts[0]?.cause.kind).toBe('ROUTE_EXECUTION_PHYSICS');
  });
});
