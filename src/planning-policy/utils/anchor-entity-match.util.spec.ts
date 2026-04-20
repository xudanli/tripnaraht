import {
  goldenCircleEntityStrongMatch,
  keywordMatchResearchPoiToSlug,
  researchPoiHasStableId,
} from './anchor-entity-match.util';

describe('anchor-entity-match (Golden Circle)', () => {
  it('DB 风格全名可实体命中 thingvellir', () => {
    const poi = { name: 'Thingvellir National Park', nameCN: '', id: 1 };
    expect(goldenCircleEntityStrongMatch(poi, 'thingvellir')).toBe(true);
    expect(researchPoiHasStableId(poi)).toBe(true);
  });

  it('Geysir Geothermal Area → geysir', () => {
    const poi = { name: 'Geysir Geothermal Area', place_id: 'p42' };
    expect(goldenCircleEntityStrongMatch(poi, 'geysir')).toBe(true);
  });

  it('Gullfoss Waterfall → gullfoss', () => {
    const poi = { name: 'Gullfoss Waterfall', id: 99 };
    expect(goldenCircleEntityStrongMatch(poi, 'gullfoss')).toBe(true);
  });

  it('关键词兜底：盖歇尔 → geysir', () => {
    const poi = { name: 'Great 盖歇尔', nameCN: '' };
    expect(keywordMatchResearchPoiToSlug(poi, 'geysir')).toBe(true);
  });

  it('Phase 3.1：仅凭「国家公园」等泛名不应 entity-strong 命中 thingvellir', () => {
    const poi = { name: '斯奈山冰川国家公园', nameCN: '', id: 1 };
    expect(goldenCircleEntityStrongMatch(poi, 'thingvellir')).toBe(false);
  });
});
