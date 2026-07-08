import { ICELAND_CANONICAL_POI_CATALOG } from '../../../canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { collectRoutePoiCandidateNames } from './collect-route-poi-candidate-names.util';

describe('collectRoutePoiCandidateNames', () => {
  it('includes explicit routeDetail.poiMentions', () => {
    const names = collectRoutePoiCandidateNames({
      routeDetail: {
        summary: '',
        totalKm: 1,
        avgDrivingHours: 1,
        stayChanges: 1,
        regions: [],
        highlights: [],
        preparations: [],
        days: [],
        map: { mainLine: [[0, 0], [1, 1]] },
        poiMentions: ['Sky Lagoon', 'Fjaðrárgljúfur', '羽毛峡谷'],
      },
      catalog: ICELAND_CANONICAL_POI_CATALOG,
    });

    expect(names).toEqual(
      expect.arrayContaining(['Sky Lagoon', 'Fjaðrárgljúfur', '羽毛峡谷']),
    );
  });

  it('parses narrative 途经 clause', () => {
    const names = collectRoutePoiCandidateNames({
      narrative: '南岸深度游。途经：Seljalandsfoss、Reynisfjara、Jökulsárlón。',
      catalog: ICELAND_CANONICAL_POI_CATALOG,
    });

    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  it('splits compound experience into individual candidates', () => {
    const names = collectRoutePoiCandidateNames({
      routeDetail: {
        summary: '',
        totalKm: 1,
        avgDrivingHours: 1,
        stayChanges: 1,
        regions: [],
        highlights: [],
        preparations: [],
        days: [
          {
            day: 1,
            theme: '黄金圈',
            route: 'Reykjavik',
            driving: '2h',
            experience: 'Geysir、Gullfoss、辛格维利尔',
            stay: 'Reykjavik',
            mapPoint: { lng: -21, lat: 64 },
          },
        ],
        map: { mainLine: [[-21, 64], [-20, 64]] },
      },
      catalog: ICELAND_CANONICAL_POI_CATALOG,
    });

    expect(names.some((n) => /geysir|间歇泉/i.test(n))).toBe(true);
    expect(names.some((n) => /gullfoss|黄金瀑布/i.test(n))).toBe(true);
    expect(names.some((n) => /thingvellir|辛格/i.test(n))).toBe(true);
  });
});
