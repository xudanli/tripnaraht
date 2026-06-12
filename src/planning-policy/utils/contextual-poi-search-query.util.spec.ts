import { filterPoisByRejectedIds } from './contextual-poi-search-query.util';

describe('contextual-poi-search-query.util', () => {
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
