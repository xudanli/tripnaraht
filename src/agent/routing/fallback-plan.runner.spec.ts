import {
  applyFallbackPlan,
  normalizeFallbackStrategyHint,
  resolvePoiPolicy,
} from './fallback-plan.runner';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('fallback-plan.runner', () => {
  it('resolvePoiPolicy and normalizeFallbackStrategyHint', () => {
    expect(resolvePoiPolicy('strict', false)).toBe('strict');
    expect(resolvePoiPolicy(undefined, true)).toBe('strict');
    expect(normalizeFallbackStrategyHint('city_walk')).toBe('CITY_WALK');
    expect(normalizeFallbackStrategyHint('nope')).toBeUndefined();
  });

  it('applyFallbackPlan stamps metadata and itinerary', () => {
    const state = {
      request_id: 'r1',
      trip_plan_request: { destination: '冰岛', request_id: 'r1' },
      decision_log: [],
      metadata: {},
      research_data: {},
    } as unknown as OrchestratorState;
    applyFallbackPlan({}, state);
    expect(state.metadata.fallback_used).toBe(true);
    expect(state.itinerary).toBeTruthy();
    expect(state.decision_log.length).toBe(1);
  });
});
