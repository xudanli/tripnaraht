import {
  attachHardTrekTrailPlanToState,
  isHardTrekTrailPlanningEnabled,
} from './hard-trek-trail-planning.hook';
import { TrailPlanningAdapter } from './trail-planning.adapter';
import type { TripWorldState } from '../world-model';

describe('hard-trek-trail-planning.hook', () => {
  const adapter = new TrailPlanningAdapter(undefined);

  it('is enabled by default', () => {
    const prev = process.env.ENABLE_HARD_TREK_TRAIL_PLANNING;
    delete process.env.ENABLE_HARD_TREK_TRAIL_PLANNING;
    expect(isHardTrekTrailPlanningEnabled()).toBe(true);
    if (prev !== undefined) process.env.ENABLE_HARD_TREK_TRAIL_PLANNING = prev;
  });

  it('attaches plan for IS_LAUGAVEGUR', async () => {
    const state = {
      context: { tripId: 't1', destination: 'IS', durationDays: 4, preferences: {} },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
    } as TripWorldState;

    await attachHardTrekTrailPlanToState(
      state,
      { name: 'IS_LAUGAVEGUR', tags: ['徒步'] },
      adapter,
    );

    expect(state.signals.hardTrekTrailPlan?.segments).toHaveLength(4);
    expect(state.signals.planningMode).toBe('trail_first');
  });
});
