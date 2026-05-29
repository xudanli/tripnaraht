import { normalizeLiveState } from './hike-plan-live-state.util';

describe('hike-plan-live-state.util', () => {
  it('normalizeLiveState defaults numeric fields to 0', () => {
    expect(normalizeLiveState(null)).toEqual({
      currentDay: 0,
      currentSegmentIndex: 0,
      progressPct: 0,
      lastCheckpointId: undefined,
      routeDeviationThresholdM: 50,
      events: [],
    });
  });

  it('preserves stored values', () => {
    expect(
      normalizeLiveState({
        currentDay: 2,
        currentSegmentIndex: 3,
        progressPct: 45,
        events: [{ id: 'e1', type: 'checkpoint', at: '2026-05-20T10:00:00Z' }],
      }),
    ).toMatchObject({
      currentDay: 2,
      currentSegmentIndex: 3,
      progressPct: 45,
    });
  });
});
