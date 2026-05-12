import { runExecutionSimulation } from './execution-simulation.engine';
import type { DraftDay } from '../../dto/trip-draft.dto';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { TripDraftState } from '../state/trip-draft-state.types';

function place(id: number, clusterId?: number): CandidatePlace {
  return {
    id,
    nameCN: `P${id}`,
    category: 'ATTRACTION',
    type: 'ATTRACTION',
    lat: 35.68 + id * 0.001,
    lng: 139.76 + id * 0.001,
    clusterId,
    popularity: 6,
    rating: 4,
    openingHours: { mon: [] },
  };
}

function minimalState(selections: TripDraftState['selections']): TripDraftState {
  return {
    tripId: 't1',
    intent: {
      rawInput: '',
      destination: 'JP',
      cities: [],
      mustHavePois: [],
      transport: 'walk',
      intensity: 'balanced',
    },
    calendar: [{ day: 1, date: '2026-06-01', weekday: '周一' }],
    selections,
    constraintLog: { mealUsed: {}, placeRepeatCount: {} },
    topology: { zoneTransitions: [] },
    uncertainty: { items: [] },
    mode: 'HYBRID',
    version: 1,
  };
}

describe('runExecutionSimulation', () => {
  it('returns scores and dimensions for a single day', () => {
    const m = new Map<number, CandidatePlace>([
      [1, place(1, 1)],
      [2, place(2, 1)],
    ]);
    const state = minimalState([
      { day: 1, slot: 'morning', placeId: 1 },
      { day: 1, slot: 'afternoon', placeId: 2 },
    ]);
    const dayRow = {
      day: 1,
      date: '2026-06-01',
      slots: {
        morning: {
          placeId: 1,
          slot: 'morning' as const,
          startTime: '2026-06-01T09:00:00.000Z',
          endTime: '2026-06-01T12:00:00.000Z',
          reason: 'x',
        },
        afternoon: {
          placeId: 2,
          slot: 'afternoon' as const,
          startTime: '2026-06-01T13:30:00.000Z',
          endTime: '2026-06-01T17:00:00.000Z',
          reason: 'y',
        },
      },
    } as unknown as DraftDay;
    const r = runExecutionSimulation({
      tripDraftState: state,
      candidatesById: m,
      validatedDays: [dayRow],
    });
    expect(r.feasibilityScore).toBeGreaterThan(0);
    expect(r.feasibilityScore).toBeLessThanOrEqual(1);
    expect(r.recommendation).toMatch(/APPROVE|WARN|REPAIR_REQUIRED/);
    expect(r.dimensions.time.totalTravelMinEstimate).toBeGreaterThanOrEqual(0);
  });
});
