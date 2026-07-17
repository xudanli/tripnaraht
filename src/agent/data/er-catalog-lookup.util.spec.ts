import {
  alignPoiWithErCatalog,
  lookupErCatalogByName,
  resetErCatalogLookupCacheForTests,
} from './er-catalog-lookup.util';

describe('er-catalog-lookup.util', () => {
  beforeEach(() => resetErCatalogLookupCacheForTests());

  it('looks up known destination labels from catalog', () => {
    const hit = lookupErCatalogByName('蓝湖') ?? lookupErCatalogByName('雷克雅未克');
    // 雷克雅未克 is in catalog ENTITY_ID_BY_LABEL
    const rek = lookupErCatalogByName('雷克雅未克');
    expect(rek?.entity_id).toBe('IS-REK');
    expect(rek?.kind).toBe('destination');
    void hit;
  });

  it('aligns poi fields when catalog hits', () => {
    const aligned = alignPoiWithErCatalog({
      name: '雷克雅未克',
      address: 'Iceland',
    });
    expect(aligned.__er_entity_id).toBe('IS-REK');
    expect(aligned.__er_standard_name).toBe('雷克雅未克');
  });

  it('passes through unknown names', () => {
    const aligned = alignPoiWithErCatalog({ name: '完全不存在的地点XYZ', address: 'x' });
    expect(aligned.__er_entity_id).toBeUndefined();
  });
});
