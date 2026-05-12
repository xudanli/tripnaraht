import type { GapBehaviorEpisodeRecord } from './gap-behavior-drift.types';
import { buildGapBehaviorDriftReport } from './gap-behavior-drift.util';
import { buildGapSelectionBiasSnapshot } from './gap-selection-bias-snapshot.util';

function ep(partial: Partial<GapBehaviorEpisodeRecord> & Pick<GapBehaviorEpisodeRecord, 'primaryGap'>): GapBehaviorEpisodeRecord {
  return {
    selectedCount: 2,
    indoorishSelectedCount: 2,
    categoryHistogram: [{ category: 'SPA', count: 2 }],
    allGapTypes: [partial.primaryGap],
    ...partial,
  };
}

describe('gap-selection-bias-snapshot.util', () => {
  it('aggregates global mix and per-gap rows aligned with drift cohorts', () => {
    const episodes: GapBehaviorEpisodeRecord[] = [
      ep({ primaryGap: 'MISSING_RAIN_FALLBACK' }),
      ep({ primaryGap: 'MISSING_RAIN_FALLBACK', categoryHistogram: [{ category: 'MUSEUM', count: 2 }] }),
      ep({
        primaryGap: 'OVER_DENSE_DAY',
        selectedCount: 4,
        indoorishSelectedCount: 0,
        categoryHistogram: [
          { category: 'FOOD', count: 3 },
          { category: 'RESTAURANT', count: 1 },
        ],
      }),
    ];
    const snap = buildGapSelectionBiasSnapshot({ episodes });
    const drift = buildGapBehaviorDriftReport({ episodes });

    expect(snap.totalEpisodeCount).toBe(3);
    expect(snap.gaps).toHaveLength(2);
    for (const g of snap.gaps) {
      const c = drift.cohorts.find((x) => x.primaryGap === g.primaryGap);
      expect(c?.categoryMixTop).toEqual(g.categoryMixTop);
      expect(c?.meanIndoorishShare).toBe(g.meanIndoorishShare);
      expect(c?.meanSelectedCount).toBe(g.meanSelectedCount);
    }
    const spaShareGlobal = snap.globalCategoryMixTop.find((x) => x.category === 'SPA')?.share;
    expect(spaShareGlobal).toBeDefined();
    expect(spaShareGlobal! + (snap.globalCategoryMixTop.find((x) => x.category === 'MUSEUM')?.share ?? 0)).toBeLessThanOrEqual(1.001);
  });

  it('handles empty episodes', () => {
    const snap = buildGapSelectionBiasSnapshot({ episodes: [] });
    expect(snap.totalEpisodeCount).toBe(0);
    expect(snap.gaps).toHaveLength(0);
    expect(snap.globalCategoryMixTop).toEqual([]);
    expect(snap.globalMeanSelectedCount).toBe(0);
  });
});
