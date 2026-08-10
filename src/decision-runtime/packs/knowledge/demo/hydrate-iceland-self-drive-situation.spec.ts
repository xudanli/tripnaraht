import type { TripPlan } from '../../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../../trips/decision/world-model';
import {
  attachIcelandSelfDriveSituationToState,
  buildIcelandSelfDriveSituationFromTripState,
} from './hydrate-iceland-self-drive-situation';

function minimalState(overrides?: Partial<TripWorldState>): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-07-20',
      durationDays: 5,
      tripId: 'trip_demo_1',
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate: {},
    signals: {
      weatherByDate: {
        '2026-07-20': { windMps: 24 } as never,
      },
      icelandSelfDriveRouteFacts: {
        schemaId: 'tripnara.iceland.self_drive_route_facts@v1',
        roadSegmentIds: ['F208'],
        routeFlags: { hasFRoad: true },
      },
    },
    policies: {
      vehicleClass: 'SUV_4WD',
    },
    ...overrides,
  } as TripWorldState;
}

function minimalPlan(): TripPlan {
  return {
    days: [
      {
        date: '2026-07-20',
        timeSlots: [
          {
            id: 'slot1',
            travelLegFromPrev: {
              mode: 'drive',
              distanceKm: 120,
              durationMin: 100,
            },
          } as never,
        ],
      },
    ],
  } as TripPlan;
}

describe('hydrate Iceland self-drive situation (live wire)', () => {
  it('builds situation from structured route facts + measured wind (no text scrape)', () => {
    const result = buildIcelandSelfDriveSituationFromTripState({
      state: minimalState(),
      plan: minimalPlan(),
    });
    expect(result).toBeDefined();
    expect(result!.schemaId).toBe('tripnara.iceland.self_drive_situation@v1');
    expect(result!.vehicleRoadFit?.roadSegmentId).toBe('F208');
    expect(result!.vehicleRoadFit?.roadBaseType).toBe('F_ROAD');
    expect(result!.weatherImpact).toBeDefined();
    expect(['NEED_CONFIRM', 'REPLAN_REQUIRED', 'BLOCK']).toContain(
      result!.verdict.gate,
    );
  });

  it('does not invent F-road from POI name text when route facts absent', () => {
    const state = minimalState({
      signals: {
        weatherByDate: {
          '2026-07-20': { windMps: 10 } as never,
        },
      },
      candidatesByDate: {
        '2026-07-20': [
          {
            id: 'poi_f208',
            type: 'activity',
            name: { en: 'F208 highland', zh: 'F208 高地' },
            intentTags: ['f-road', 'highland'],
            location: { point: { lat: 64.0, lng: -19.0 } },
          } as never,
        ],
      },
    } as never);
    const result = buildIcelandSelfDriveSituationFromTripState({
      state,
      plan: minimalPlan(),
    });
    expect(result).toBeDefined();
    expect(result!.vehicleRoadFit?.roadBaseType).toBe('PAVED');
    expect(result!.vehicleRoadFit?.roadSegmentId).toBe('RING_ROAD');
  });

  it('reads F-road from execution overlay structured road.fRoadConstraint', () => {
    const state = minimalState({
      signals: {
        weatherByDate: {
          '2026-07-20': { windMps: 10 } as never,
        },
        executionOverlayFrames: [
          {
            schemaVersion: '1',
            legId: 'leg1',
            road: { blocked: false, fRoadConstraint: true },
            route: {
              roadAccessibility: { fRoad: true },
            },
          } as never,
        ],
      },
    } as never);
    const result = buildIcelandSelfDriveSituationFromTripState({
      state,
      plan: minimalPlan(),
    });
    expect(result!.vehicleRoadFit?.roadBaseType).toBe('F_ROAD');
  });

  it('attaches onto state.signals.icelandSelfDriveSituation', () => {
    const state = minimalState();
    const attached = attachIcelandSelfDriveSituationToState(state, minimalPlan());
    expect(attached).toBeDefined();
    expect(state.signals.icelandSelfDriveSituation?.verdict.gate).toBeDefined();
  });

  it('returns undefined / clears for non-Iceland destinations', () => {
    const state = minimalState({
      context: {
        destination: 'New Zealand',
        startDate: '2026-07-20',
      },
    } as never);
    state.signals.icelandSelfDriveSituation = {
      schemaId: 'tripnara.iceland.self_drive_situation@v1',
      aggregate: { status: 'ALLOW', reasons: [], recommendedActions: [], evidence: [] },
      verdict: { gate: 'ALLOW', summary: 'x', primaryActions: [] },
    } as never;
    const result = attachIcelandSelfDriveSituationToState(state, minimalPlan());
    expect(result).toBeUndefined();
    expect(state.signals.icelandSelfDriveSituation).toBeUndefined();
  });
});
