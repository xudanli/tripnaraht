import { buildSpecialRegionSupplementLanes } from './special-region-supplement.registry';
import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';

const POI_CTX: PoiSearchContext = { destination: 'Iceland', pacing: 'relaxed' };

describe('special-region-supplement.registry', () => {
  it('golden_circle + westfjords 合并去重车道', () => {
    const lanes = buildSpecialRegionSupplementLanes(
      ['golden_circle', 'westfjords', 'golden_circle'],
      { poiSearchCtx: POI_CTX, boostedTerms: ['waterfall'] },
    );
    const keys = lanes.map((l) => l.key);
    expect(keys).toContain('golden_circle_pair');
    expect(keys).toContain('westfjords_scenic');
    expect(keys.filter((k) => k === 'golden_circle_pair')).toHaveLength(1);
  });
});
