import type { GapBehaviorEpisodeRecord } from './gap-behavior-drift.types';
import { buildGapStabilityMap } from './gap-stability-map.util';

function ep(partial: Partial<GapBehaviorEpisodeRecord> & Pick<GapBehaviorEpisodeRecord, 'primaryGap'>): GapBehaviorEpisodeRecord {
  return {
    selectedCount: 2,
    indoorishSelectedCount: 1,
    categoryHistogram: [
      { category: 'SPA', count: 1 },
      { category: 'MUSEUM', count: 1 },
    ],
    allGapTypes: [partial.primaryGap],
    ...partial,
  };
}

describe('gap-stability-map.util', () => {
  it('marks no_slot_data when episodes lack slot counts', () => {
    const map = buildGapStabilityMap({
      episodes: [ep({ primaryGap: 'MISSING_RAIN_FALLBACK', ts: '2026-01-01T00:00:00Z' })],
    });
    expect(map.rows).toHaveLength(1);
    expect(map.rows[0]?.timeSlotStructure).toBe('no_slot_data');
    expect(map.rows[0]?.dominantCategory).toBe('SPA');
  });

  it('classifies evening_leaning from slot-heavy episodes', () => {
    const map = buildGapStabilityMap({
      episodes: [
        ep({
          primaryGap: 'OVER_DENSE_DAY',
          categoryHistogram: [{ category: 'FOOD', count: 2 }],
          eveningLikeSelectedCount: 4,
          morningLikeSelectedCount: 0,
        }),
      ],
    });
    expect(map.rows[0]?.timeSlotStructure).toBe('evening_leaning');
    expect(map.rows[0]?.meanEveningSlotShare).toBeCloseTo(1, 5);
    expect(map.rows[0]?.dominantCategory).toBe('FOOD');
  });

  it('classifies morning_leaning', () => {
    const map = buildGapStabilityMap({
      episodes: [
        ep({
          primaryGap: 'LACK_LOCAL_FOOD',
          categoryHistogram: [{ category: 'RESTAURANT', count: 2 }],
          eveningLikeSelectedCount: 0,
          morningLikeSelectedCount: 3,
        }),
      ],
    });
    expect(map.rows[0]?.timeSlotStructure).toBe('morning_leaning');
  });

  it('exposes runner-up category when mix is split', () => {
    const map = buildGapStabilityMap({
      episodes: [ep({ primaryGap: 'INSUFFICIENT_REST' })],
    });
    const row = map.rows.find((r) => r.primaryGap === 'INSUFFICIENT_REST');
    expect(row?.runnerUpCategory).toBe('MUSEUM');
    expect(row?.runnerUpCategoryShare).toBeGreaterThan(0);
  });
});
