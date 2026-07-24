import { ICELAND_CANONICAL_POI_CATALOG } from '../fixtures/iceland-canonical-poi.catalog';
import { runFuzzyAliasStage } from './fuzzy-alias.stage';

describe('runFuzzyAliasStage', () => {
  it('matches 塞里雅兰瀑布 via substring alias', () => {
    const hits = runFuzzyAliasStage({
      query: '塞里雅兰瀑布',
      countryCode: 'IS',
      catalog: ICELAND_CANONICAL_POI_CATALOG,
    });
    expect(hits[0]?.poi.poiId).toBe('is.seljalandsfoss');
    expect(hits[0]?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('matches 杰古沙龙冰河湖 to Jökulsárlón', () => {
    const hits = runFuzzyAliasStage({
      query: '杰古沙龙冰河湖',
      countryCode: 'IS',
      catalog: ICELAND_CANONICAL_POI_CATALOG,
    });
    expect(hits.some((h) => h.poi.poiId === 'is.jokulsarlon')).toBe(true);
  });
});
