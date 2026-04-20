import {
  extractPlanningSlugsFromPois,
  resolveIcelandPlanningSlugFromPoi,
  computeTopAnchorRanksInSelection,
  countPoiPlanningFallbackInPois,
  computeUnresolvedAnchorReasonsForPoiRows,
  matchGoldenCircleSlugFromHaystack,
} from './poi-planning-slug-resolve.util';

describe('poi-planning-slug-resolve.util', () => {
  it('resolves anchor slug on POI', () => {
    expect(
      resolveIcelandPlanningSlugFromPoi({
        name: 'Other',
        poi_planning_anchor_slug: 'gullfoss',
      }),
    ).toBe('gullfoss');
  });

  it('matches Icelandic keywords on name', () => {
    expect(
      resolveIcelandPlanningSlugFromPoi({
        name: 'Visit Gullfoss waterfall',
      }),
    ).toBe('gullfoss');
  });

  it('Phase 2.3: Great Geysir / Strokkur 显式映射到 geysir', () => {
    expect(resolveIcelandPlanningSlugFromPoi({ name: 'Great Geysir' })).toBe('geysir');
    expect(resolveIcelandPlanningSlugFromPoi({ name: 'Strokkur eruption area' })).toBe('geysir');
  });

  it('Phase 2.3: Thingvellir National Park 显式映射', () => {
    expect(
      resolveIcelandPlanningSlugFromPoi({ name: 'Thingvellir National Park' }),
    ).toBe('thingvellir');
  });

  it('matchGoldenCircleSlugFromHaystack prefers longer alias', () => {
    const h = matchGoldenCircleSlugFromHaystack('great geysir area tour');
    expect(h).toBe('geysir');
  });

  it('extracts ordered unique slugs from POI list', () => {
    const slugs = extractPlanningSlugsFromPois([
      { name: 'Thingvellir', poi_planning_anchor_slug: 'thingvellir' },
      { name: 'Geysir area' },
    ]);
    expect(slugs).toEqual(['thingvellir', 'geysir']);
  });

  it('computes anchor ranks in selection', () => {
    const ranks = computeTopAnchorRanksInSelection(
      ['gullfoss', 'thingvellir'],
      [{ name: 'Gullfoss' }, { name: 'X' }, { poi_planning_anchor_slug: 'thingvellir' }],
    );
    expect(ranks['gullfoss']).toBe(1);
    expect(ranks['thingvellir']).toBe(3);
  });

  it('counts fallback stubs', () => {
    expect(
      countPoiPlanningFallbackInPois([
        { source: 'poi_planning_fallback' },
        { source: 'other' },
        { source: 'poi_planning_fallback' },
      ]),
    ).toBe(2);
  });

  it('computeUnresolvedAnchorReasonsForPoiRows: not_in_topn when TopN 无别名命中', () => {
    const reasons = computeUnresolvedAnchorReasonsForPoiRows(
      ['thingvellir'],
      [],
      [{ name: 'Random Restaurant Reykjavik' }],
    );
    expect(reasons?.thingvellir).toBe('not_in_topn');
  });
});
