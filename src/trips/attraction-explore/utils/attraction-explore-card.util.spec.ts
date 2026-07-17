import {
  buildContextTip,
  formatTravelInfo,
  resolvePrimaryAction,
  sortRecommendationItems,
} from './attraction-explore-card.util';
import type { AttractionExploreRecommendationItem } from '../types/attraction-explore.types';

function item(
  partial: Partial<AttractionExploreRecommendationItem> & { placeId: number },
): AttractionExploreRecommendationItem {
  return {
    id: partial.placeId,
    placeId: partial.placeId,
    name: partial.name ?? `P${partial.placeId}`,
    category: 'ATTRACTION',
    meta: {},
    ...partial,
  };
}

describe('attraction-explore-card.util', () => {
  it('formats travelInfo', () => {
    expect(formatTravelInfo(12, 8.6)).toBe('驾车 12 分钟 · 距离 8.6 km');
  });

  it('builds weather contextTip', () => {
    expect(buildContextTip('强风 20 m/s')).toMatch(/强风/);
    expect(buildContextTip(null)).toBeUndefined();
  });

  it('resolves primaryAction', () => {
    expect(resolvePrimaryAction(false)).toBe('add_to_day');
    expect(resolvePrimaryAction(true)).toBe('add');
  });

  it('sorts by distance / match', () => {
    const rows = [
      item({ placeId: 1, distanceKm: 20, matchPercent: 50, score: 0.5 }),
      item({ placeId: 2, distanceKm: 5, matchPercent: 90, score: 0.9 }),
    ];
    expect(sortRecommendationItems(rows, 'distance').map((r) => r.placeId)).toEqual([2, 1]);
    expect(sortRecommendationItems(rows, 'match').map((r) => r.placeId)).toEqual([2, 1]);
  });
});
