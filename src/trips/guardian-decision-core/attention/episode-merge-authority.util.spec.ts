import {
  problemHasMergeAuthority,
  resolveWeatherEpisodeId,
} from './episode-merge-authority.util';

describe('episode-merge-authority', () => {
  it('effect without episode or lineage has no merge authority', () => {
    expect(
      problemHasMergeAuthority({
        problemId: 'p1',
        tripId: 't1',
        semanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
        status: 'OPEN',
        detectedAt: '2026-07-12T10:00:00Z',
      }),
    ).toBe(false);
  });

  it('effect with causedBy has merge authority', () => {
    expect(
      problemHasMergeAuthority({
        problemId: 'p1',
        tripId: 't1',
        semanticCapability: 'EXECUTION_SCHEDULE_INFEASIBLE',
        status: 'OPEN',
        detectedAt: '2026-07-12T10:00:00Z',
        causedByProblemId: 'p_wind',
      }),
    ).toBe(true);
  });

  it('weather root may use context episode', () => {
    expect(
      resolveWeatherEpisodeId({
        problem: {
          problemId: 'p_wind',
          tripId: 't1',
          semanticCapability: 'WEATHER_STRONG_WIND',
          status: 'OPEN',
          detectedAt: '2026-07-12T09:00:00Z',
        },
        contextEpisodeId: 'ep_am',
      }),
    ).toBe('ep_am');
  });
});
