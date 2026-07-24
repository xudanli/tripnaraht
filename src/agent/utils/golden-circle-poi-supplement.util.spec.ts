import { buildGoldenCircleSupplementPlans } from './golden-circle-poi-supplement.util';
import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';

const POI_CTX: PoiSearchContext = {
  destination: 'Iceland',
  noveltyBias: 0.5,
  fatigueScore: 0.4,
  pacing: 'relaxed',
};

describe('golden-circle-poi-supplement.util', () => {
  it('pair 计划产出多路 routes 并注入黄金圈锚点拓展', () => {
    const { pair } = buildGoldenCircleSupplementPlans({ poiSearchCtx: POI_CTX });
    expect(pair.routes.length).toBeGreaterThan(1);
    expect(pair.rewrite.standardized_query.filters?.region_id).toBe('golden_circle');
    expect(pair.rewrite.expansion_routes.hyponym).toEqual(
      expect.arrayContaining(['thingvellir', 'geysir', 'gullfoss']),
    );
    expect(pair.contextualizedQuery).toMatch(/geysir|gullfoss/i);
  });

  it('有 boostedTerms 时产出 anchor 补检计划', () => {
    const { anchor, pair } = buildGoldenCircleSupplementPlans({
      poiSearchCtx: POI_CTX,
      boostedTerms: ['waterfall', 'national park'],
    });
    expect(anchor).toBeDefined();
    expect(anchor!.routes.length).toBeGreaterThan(1);
    expect(anchor!.contextualizedQuery).toMatch(/Golden Circle/i);
    expect(anchor!.contextualizedQuery).toMatch(/waterfall|national park/i);
    expect(pair.routes.length).toBeGreaterThan(1);
  });

  it('无 boostedTerms 时不产出 anchor', () => {
    const { anchor } = buildGoldenCircleSupplementPlans({ poiSearchCtx: POI_CTX });
    expect(anchor).toBeUndefined();
  });
});
