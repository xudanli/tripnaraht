import {
  hydrateTripPlanFromConstraintSink,
  mergeConstraintSinkIntoMemoryContractObs,
} from './hydrate-trip-plan-from-constraint-sink.util';
import { CONSTRAINT_SINK_V1_KEY } from './constraint-sink.types';
import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';

describe('hydrateTripPlanFromConstraintSink', () => {
  const activeTripState: TripTaskMemory = {
    tripId: 'trip-1',
    userId: 'user-1',
    constraints: {
      [CONSTRAINT_SINK_V1_KEY]: {
        revision: 'v1',
        patches: [
          {
            id: 'p1',
            at: new Date().toISOString(),
            confidence: 0.9,
            provenance: 'rule',
            delta: {
              destination_pivot: { to: 'highlands' },
              negative: { avoid_regions: ['south_coast'], notes_zh: '避免南岸' },
              pace: 'relaxed',
            },
          },
        ],
      },
    },
  } as TripTaskMemory;

  it('merges folded patches when request has no explicit destination', () => {
    const { tripPlanRequest, applied } = hydrateTripPlanFromConstraintSink(
      { message: '生成方案', destination: '未指定' },
      activeTripState,
      { message: '生成方案' } as any,
    );
    expect(tripPlanRequest.destination).toBe('highlands');
    expect(tripPlanRequest.pace).toBe('relaxed');
    expect(applied.keys).toEqual(
      expect.arrayContaining(['destination', 'pace', 'guardian_debate_intent_hint']),
    );
    expect(tripPlanRequest.message).toContain('[CONSTRAINT_SINK]');
  });

  it('respects explicit request destination over sink', () => {
    const { tripPlanRequest, applied } = hydrateTripPlanFromConstraintSink(
      { destination: 'Reykjavik', message: '去雷克雅未克' },
      activeTripState,
      { destination: 'Reykjavik', message: '去雷克雅未克' } as any,
    );
    expect(tripPlanRequest.destination).toBe('Reykjavik');
    expect(applied.overridden_by_request).toContain('destination');
  });
});

describe('mergeConstraintSinkIntoMemoryContractObs', () => {
  it('adds constraint_sink block and layer tag', () => {
    const merged = mergeConstraintSinkIntoMemoryContractObs(
      { revision: 'v1', layers: ['L1_user_profile'] },
      { keys: ['destination'], patch_ids: ['p1'], overridden_by_request: [] },
    );
    expect(merged.layers).toContain('constraint_sink_hydrated');
    expect(merged.constraint_sink).toMatchObject({
      hydrated: true,
      applied_keys: ['destination'],
      patch_ids: ['p1'],
    });
  });
});
