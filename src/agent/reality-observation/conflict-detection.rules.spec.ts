import { detectObservationConflicts } from './conflict-detection.rules';
import type { ObservationExecutionState } from './observation-executor';
import { reflectObservation } from './observation-executor';
import type { ObservationPlan } from './reality-observation.types';

function baseState(
  over: Partial<ObservationExecutionState> = {},
): ObservationExecutionState {
  const plan: ObservationPlan = {
    operation: 'ROUTE_EXECUTABILITY',
    labelZh: '路线可执行性',
    scope: { message: '我订的是两驱车，但路线里安排了 F208', tripId: 't1' },
    needs: [],
    maxReflectRounds: 2,
    completionCriteria: [],
    safetyFloorKeys: [],
  };
  return {
    plan,
    observedFacts: [],
    derivedFacts: [],
    unknowns: [],
    reflectRoundsUsed: 0,
    lastReflection: null,
    ...over,
  };
}

describe('conflict-detection.rules', () => {
  it('detects 2WD vs F-road as HARD conflict', () => {
    const state = baseState({
      observedFacts: [
        {
          key: 'vehicle.driveType',
          value: '2WD',
          scope: {},
          source: { provider: 'SEED', authority: 'INTERNAL' },
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
        {
          key: 'route.roadSegments',
          value: [{ id: 'F208', kind: 'F-road' }],
          scope: {},
          source: { provider: 'SEED', authority: 'INTERNAL' },
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
      ],
    });
    const conflicts = detectObservationConflicts({
      state,
      message: state.plan.scope.message,
    });
    expect(conflicts.some((c) => c.code === 'VEHICLE_FROAD_MISMATCH')).toBe(true);
    expect(conflicts.find((c) => c.code === 'VEHICLE_FROAD_MISMATCH')?.severity).toBe(
      'HARD',
    );
  });

  it('reflectObservation asks user on hard conflict instead of freeze', () => {
    const state = baseState({
      observedFacts: [
        {
          key: 'vehicle.driveType',
          value: '2WD',
          scope: {},
          source: { provider: 'SEED', authority: 'INTERNAL' },
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
        {
          key: 'route.roadSegments',
          value: 'F208 highland',
          scope: {},
          source: { provider: 'SEED', authority: 'INTERNAL' },
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
      ],
    });
    const reflection = reflectObservation(state);
    expect(reflection.conflictingFacts.length).toBeGreaterThan(0);
    expect(reflection.nextAction).toBe('ASK_USER');
    expect(reflection.sufficientlyObserved).toBe(false);
  });

  it('detects booking time mismatch', () => {
    const state = baseState({
      plan: {
        operation: 'DAY_EXECUTABILITY',
        labelZh: '当日可执行',
        scope: { message: '' },
        needs: [],
        maxReflectRounds: 2,
        completionCriteria: [],
        safetyFloorKeys: [],
      },
      observedFacts: [
        {
          key: 'booking.fixedCommitments',
          value: [{ title: '冰川徒步', confirmedTime: '09:00', status: 'BOOKED' }],
          scope: {},
          source: { provider: 'SEED', authority: 'INTERNAL' },
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
        {
          key: 'targetDay.activities',
          value: [{ title: '冰川徒步', departTime: '10:00' }],
          scope: {},
          source: { provider: 'SEED', authority: 'INTERNAL' },
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
      ],
    });
    const conflicts = detectObservationConflicts({ state });
    expect(conflicts.some((c) => c.code === 'BOOKING_TIME_MISMATCH')).toBe(true);
  });

  it('detects driving preference vs load', () => {
    const state = baseState({
      plan: {
        operation: 'DAY_PACE',
        labelZh: '节奏',
        scope: { message: '我不想每天开太久' },
        needs: [],
        maxReflectRounds: 2,
        completionCriteria: [],
        safetyFloorKeys: [],
      },
      derivedFacts: [
        {
          key: 'derived.day.totalDrivingMinutes',
          value: 360,
          derivedFrom: [],
          method: 'seed',
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
      ],
    });
    const conflicts = detectObservationConflicts({
      state,
      message: state.plan.scope.message,
    });
    expect(conflicts.some((c) => c.code === 'DRIVING_LOAD_VS_PREFERENCE')).toBe(true);
  });
});
