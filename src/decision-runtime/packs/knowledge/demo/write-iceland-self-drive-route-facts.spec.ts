import type { TripWorldState } from '../../../../trips/decision/world-model';
import {
  attachIcelandSelfDriveRouteFactsToState,
  buildIcelandSelfDriveRouteFactsFromTripState,
} from './write-iceland-self-drive-route-facts';
import { buildIcelandSelfDriveSituationFromTripState } from './hydrate-iceland-self-drive-situation';
import type { TripPlan } from '../../../../trips/decision/plan-model';

function baseState(overrides?: Partial<TripWorldState>): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-07-20',
      durationDays: 5,
      tripId: 'trip_rf_1',
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {},
    signals: {},
    policies: { vehicleClass: 'SEDAN' },
    ...overrides,
  } as TripWorldState;
}

describe('write-iceland-self-drive-route-facts', () => {
  it('writes RING_ROAD baseline when no highland signals', () => {
    const state = baseState();
    const facts = attachIcelandSelfDriveRouteFactsToState({ state });
    expect(facts?.roadSegmentIds).toEqual(['RING_ROAD']);
    expect(facts?.routeFlags?.hasFRoad).toBeUndefined();
    expect(state.signals.icelandSelfDriveRouteFacts?.vehicleClass).toBe('SEDAN');
  });

  it('projects planner meta fRoadIds + NO_F_ROAD into route facts', () => {
    const state = baseState({
      policies: {
        vehicleClass: 'SEDAN',
        fRoadIds: ['F208'],
        fRoadAllowed: false,
        hasGravel: true,
      } as never,
    });
    const facts = buildIcelandSelfDriveRouteFactsFromTripState({ state });
    expect(facts?.roadSegmentIds).toContain('F208');
    expect(facts?.routeFlags?.hasFRoad).toBe(true);
    expect(facts?.routeFlags?.hasGravel).toBe(true);
    expect(facts?.rentalRestrictions).toContain('NO_F_ROAD');
  });

  it('merges world constraint road CLOSED status', () => {
    const state = baseState({
      signals: {
        executionSemanticView: {
          version: '1',
          emittedAt: new Date().toISOString(),
          byDate: {},
          world: {
            version: 1,
            lastUpdatedAt: Date.now(),
            constraints: {
              version: 1,
              lastUpdatedAt: Date.now(),
              roads: {
                F208: {
                  id: 'F208',
                  type: 'ROAD',
                  state: 'CLOSED',
                  severity: 90,
                  temporalScope: { start: '2026-07-20', end: '2026-07-21' },
                  impactWeight: 1,
                  version: 1,
                },
              },
              weather: {},
              bookings: {},
            },
          },
        },
      },
    } as never);
    const facts = buildIcelandSelfDriveRouteFactsFromTripState({ state });
    expect(facts?.roadSegmentIds).toContain('F208');
    expect(facts?.roadStatusBySegmentId?.F208).toBe('CLOSED');
    expect(facts?.routeFlags?.hasFRoad).toBe(true);
  });

  it('feeds situation hydrate so F-road + 2WD is not default RING_ROAD', () => {
    const state = baseState({
      policies: {
        vehicleClass: 'SEDAN',
        fRoadIds: ['F208'],
        fRoadAllowed: false,
      } as never,
      signals: {
        weatherByDate: {
          '2026-07-20': { windMps: 10 } as never,
        },
      },
    });
    attachIcelandSelfDriveRouteFactsToState({ state });
    const plan = {
      days: [{ date: '2026-07-20', timeSlots: [] }],
    } as TripPlan;
    const situation = buildIcelandSelfDriveSituationFromTripState({ state, plan });
    expect(situation?.vehicleRoadFit?.roadBaseType).toBe('F_ROAD');
    expect(situation?.vehicleRoadFit?.roadSegmentId).toBe('F208');
    expect(['NEED_CONFIRM', 'REPLAN_REQUIRED', 'BLOCK', 'REJECT']).toContain(
      situation?.verdict.gate,
    );
  });

  it('clears facts for non-Iceland destinations', () => {
    const state = baseState({
      context: {
        destination: 'Japan',
        startDate: '2026-07-20',
      },
    } as never);
    state.signals.icelandSelfDriveRouteFacts = {
      roadSegmentIds: ['F208'],
    };
    const facts = attachIcelandSelfDriveRouteFactsToState({ state });
    expect(facts).toBeUndefined();
    expect(state.signals.icelandSelfDriveRouteFacts).toBeUndefined();
  });
});
