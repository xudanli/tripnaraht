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

  it('registers greenland and svalbard polar supplement lanes', () => {
    const gl = buildSpecialRegionSupplementLanes(['greenland'], {
      poiSearchCtx: { destination: 'Greenland', pacing: 'relaxed' },
    });
    expect(gl.map((l) => l.key)).toEqual(
      expect.arrayContaining(['greenland_nuuk', 'greenland_disco']),
    );

    const sj = buildSpecialRegionSupplementLanes(['svalbard'], {
      poiSearchCtx: { destination: 'Svalbard', pacing: 'relaxed' },
    });
    expect(sj.map((l) => l.key)).toEqual(
      expect.arrayContaining(['svalbard_base', 'svalbard_expedition']),
    );
  });
});
