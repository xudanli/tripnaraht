import { TrailPlanningAdapter } from './trail-planning.adapter';

describe('TrailPlanningAdapter', () => {
  const adapter = new TrailPlanningAdapter(undefined);

  it('builds IS_LAUGAVEGUR skeleton segments', async () => {
    const result = await adapter.buildPreview({
      routeDirectionName: 'IS_LAUGAVEGUR',
      longestHike: 2,
    });
    expect(result.mode).toBe('trail_segments');
    expect(result.segments).toHaveLength(4);
    expect(result.summary.maxDailyAscentM).toBeGreaterThan(0);
  });
});
