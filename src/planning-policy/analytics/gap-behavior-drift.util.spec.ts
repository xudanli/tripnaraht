import { buildGapBehaviorDriftReport } from './gap-behavior-drift.util';
import type { GapBehaviorEpisodeRecord } from './gap-behavior-drift.types';

function ep(partial: Partial<GapBehaviorEpisodeRecord> & Pick<GapBehaviorEpisodeRecord, 'primaryGap'>): GapBehaviorEpisodeRecord {
  return {
    selectedCount: 4,
    indoorishSelectedCount: 2,
    categoryHistogram: [
      { category: 'MUSEUM', count: 2 },
      { category: 'ATTRACTION', count: 2 },
    ],
    allGapTypes: [partial.primaryGap],
    ...partial,
  };
}

describe('gap-behavior-drift.util', () => {
  it('aggregates cohorts by primaryGap', () => {
    const report = buildGapBehaviorDriftReport({
      episodes: [
        ep({ primaryGap: 'MISSING_RAIN_FALLBACK', ts: '2026-01-01T10:00:00Z' }),
        ep({ primaryGap: 'MISSING_RAIN_FALLBACK', ts: '2026-01-02T10:00:00Z', indoorishSelectedCount: 4, selectedCount: 4 }),
        ep({ primaryGap: 'OVER_DENSE_DAY', ts: '2026-01-01T12:00:00Z', indoorishSelectedCount: 0, selectedCount: 3 }),
      ],
    });
    expect(report.cohorts).toHaveLength(2);
    const rain = report.cohorts.find((c) => c.primaryGap === 'MISSING_RAIN_FALLBACK');
    expect(rain?.episodeCount).toBe(2);
    expect(rain?.meanIndoorishShare).toBeCloseTo((0.5 + 1) / 2, 5);
    expect(rain?.meanSelectedCount).toBe(4);
    expect(report.cohorts.find((c) => c.primaryGap === 'OVER_DENSE_DAY')?.meanSelectedCount).toBe(3);
  });

  it('flags indoor share drift across temporal split', () => {
    const episodes: GapBehaviorEpisodeRecord[] = [
      ep({
        primaryGap: 'MISSING_RAIN_FALLBACK',
        ts: '2026-01-01T10:00:00Z',
        indoorishSelectedCount: 1,
        selectedCount: 4,
      }),
      ep({
        primaryGap: 'MISSING_RAIN_FALLBACK',
        ts: '2026-06-01T10:00:00Z',
        indoorishSelectedCount: 4,
        selectedCount: 4,
      }),
    ];
    const report = buildGapBehaviorDriftReport({
      episodes,
      temporalSplitIso: '2026-03-01T00:00:00Z',
    });
    expect(report.driftFlags.some((f) => f.signal === 'indoor_share_shift')).toBe(true);
  });

  it('flags top category shift', () => {
    const episodes: GapBehaviorEpisodeRecord[] = [
      {
        primaryGap: 'OVER_DENSE_DAY',
        ts: '2026-01-01T10:00:00Z',
        selectedCount: 4,
        indoorishSelectedCount: 0,
        categoryHistogram: [{ category: 'MUSEUM', count: 4 }],
        allGapTypes: ['OVER_DENSE_DAY'],
      },
      {
        primaryGap: 'OVER_DENSE_DAY',
        ts: '2026-06-01T10:00:00Z',
        selectedCount: 4,
        indoorishSelectedCount: 0,
        categoryHistogram: [{ category: 'SPA', count: 4 }],
        allGapTypes: ['OVER_DENSE_DAY'],
      },
    ];
    const report = buildGapBehaviorDriftReport({
      episodes,
      temporalSplitIso: '2026-03-01T00:00:00Z',
    });
    expect(report.driftFlags.some((f) => f.signal === 'top_category_shift')).toBe(true);
  });
});
