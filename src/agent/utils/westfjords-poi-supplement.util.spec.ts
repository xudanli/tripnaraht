import { buildWestfjordsSupplementLanes } from './westfjords-poi-supplement.util';
import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';

const POI_CTX: PoiSearchContext = {
  destination: 'Iceland',
  noveltyBias: 0.55,
  pacing: 'relaxed',
};

describe('westfjords-poi-supplement.util', () => {
  it('产出 4 条西峡湾多路补检车道', () => {
    const lanes = buildWestfjordsSupplementLanes({
      poiSearchCtx: POI_CTX,
      boostedTerms: ['Dynjandi', 'viewpoint'],
    });
    expect(lanes).toHaveLength(4);
    expect(lanes.map((l) => l.key)).toEqual([
      'westfjords_scenic',
      'westfjords_route61',
      'westfjords_ferry_froad',
      'westfjords_birdwatch',
    ]);
    for (const lane of lanes) {
      expect(lane.plan.routes.length).toBeGreaterThan(1);
      expect(lane.plan.rewrite.standardized_query.filters?.region_id).toBe('westfjords');
    }
  });
});
