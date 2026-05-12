import {
  buildContextualPoiSearchQuerySuffix,
  filterPoisByRejectedIds,
} from './contextual-poi-search-query.util';
import type { PoiSearchContext } from '../types/poi-search-context.types';

describe('contextual-poi-search-query.util', () => {
  it('buildContextualPoiSearchQuerySuffix adds novelty and fatigue hints', () => {
    const ctx: PoiSearchContext = {
      destination: 'Iceland',
      noveltyBias: 0.6,
      fatigueScore: 0.5,
      pacing: 'relaxed',
    };
    const s = buildContextualPoiSearchQuerySuffix(ctx);
    expect(s).toMatch(/hidden|slow|easy/i);
  });

  it('filterPoisByRejectedIds removes matching ids', () => {
    const pois = [
      { poi_id: '111', name: 'A' },
      { id: '222', name: 'B' },
    ];
    const out = filterPoisByRejectedIds(pois as any[], ['111']);
    expect(out).toHaveLength(1);
    expect((out[0] as any).name).toBe('B');
  });
});
