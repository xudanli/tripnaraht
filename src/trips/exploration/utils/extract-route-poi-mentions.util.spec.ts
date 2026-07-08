import type { CanonicalPOI } from '../../../canonical-poi-resolution/types/canonical-poi.types';
import { ICELAND_CANONICAL_POI_CATALOG } from '../../../canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { extractCatalogPoiMentions, extractRoutePoiMentionNames } from './extract-route-poi-mentions.util';

describe('extractRoutePoiMentions', () => {
  const catalog: CanonicalPOI[] = ICELAND_CANONICAL_POI_CATALOG;

  const baseRouteDetail = {
    summary: '少赶路，把体验集中在南岸与黄金圈',
    totalKm: 100,
    avgDrivingHours: 2,
    stayChanges: 1,
    regions: ['南岸'],
    highlights: ['南岸瀑布与黑沙滩深度停留'],
    preparations: [],
    days: [
      {
        day: 2,
        theme: '黄金圈',
        route: '雷克雅未克 → 黄金圈 → 雷克雅未克',
        driving: '2.5h',
        experience: '间歇泉、黄金瀑布、辛格维利尔',
        stay: 'Reykjavik',
        mapPoint: { lng: -21, lat: 64 },
      },
    ],
    map: { mainLine: [[-21, 64], [-20, 64]] as Array<[number, number]> },
  };

  it('extracts 蓝湖 and 黑沙滩 from narrative + highlights', () => {
    const names = extractRoutePoiMentionNames({
      narrative: 'Day 2 建议去蓝湖泡温泉',
      routeDetail: baseRouteDetail,
      catalog,
    });

    expect(names.some((n) => /蓝湖/i.test(n))).toBe(true);
    expect(names.some((n) => /黑沙滩|reynis/i.test(n))).toBe(true);
    expect(names.some((n) => /黄金瀑布|gullfoss/i.test(n))).toBe(true);
  });

  it('catalog scan finds Blue Lagoon in English text', () => {
    const mentions = extractCatalogPoiMentions('Visit Blue Lagoon before driving south', catalog);
    expect(mentions.some((m) => /blue lagoon/i.test(m))).toBe(true);
  });

  it('splits compound experience into individual catalog POIs', () => {
    const names = extractRoutePoiMentionNames({
      routeDetail: baseRouteDetail,
      catalog,
    });

    expect(names).toEqual(expect.arrayContaining(['间歇泉', '黄金瀑布', '辛格维利尔']));
    expect(names.some((n) => n.includes('、'))).toBe(false);
  });

  it('does not treat route segments or themes as POI mentions', () => {
    const names = extractRoutePoiMentionNames({
      routeDetail: {
        ...baseRouteDetail,
        days: [
          {
            day: 4,
            theme: '东部峡湾',
            route: 'Höfn → Egilsstaðir',
            driving: '3.5h',
            experience: '峡湾与渔村',
            stay: 'Egilsstaðir',
            mapPoint: { lng: -14, lat: 65 },
          },
        ],
      },
      catalog,
    });

    expect(names).not.toContain('Höfn → Egilsstaðir');
    expect(names).not.toContain('东部峡湾');
    expect(names).not.toContain('峡湾与渔村');
    expect(names).not.toContain('Egilsstaðir');
  });

  it('finds POIs embedded in day.route via catalog scan only', () => {
    const names = extractRoutePoiMentionNames({
      routeDetail: {
        ...baseRouteDetail,
        days: [
          {
            day: 5,
            theme: '进入高地区域',
            route: '米湖 → Askja 高地',
            driving: '4.2h',
            experience: '高地 F 路、地热景观',
            stay: '高地 hut',
            mapPoint: { lng: -16.7, lat: 65 },
          },
          {
            day: 2,
            theme: '南岸深度',
            route: 'Vík → 冰河湖',
            driving: '2.5h',
            experience: '冰川与浮冰',
            stay: 'Höfn',
            mapPoint: { lng: -16, lat: 64 },
          },
        ],
      },
      catalog,
    });

    expect(names.some((n) => /askja/i.test(n))).toBe(true);
    expect(names.some((n) => /冰河湖/i.test(n))).toBe(true);
    expect(names).not.toContain('Vík → 冰河湖');
  });

  it('does not treat summary or narrative prose as POI mentions', () => {
    const names = extractRoutePoiMentionNames({
      narrative: '尽可能覆盖更多冰岛区域，驾驶强度更高',
      routeDetail: {
        ...baseRouteDetail,
        summary: '适合时间有限但想看更多地方的旅行者',
        highlights: ['环岛经典动线一次看完', '景观类型丰富'],
        days: [],
      },
      catalog,
    });

    expect(names).toHaveLength(0);
  });

  it('extracts POIs from map mainLine anchors', () => {
    const names = extractRoutePoiMentionNames({
      routeDetail: {
        summary: '',
        totalKm: 100,
        avgDrivingHours: 2,
        stayChanges: 1,
        regions: [],
        highlights: [],
        preparations: [],
        days: [],
        map: {
          mainLine: [
            [-19.0083, 63.4186],
            [-16.1783, 64.0475],
            [-16.7283, 65.6035],
          ],
        },
      },
      catalog,
    });

    expect(names.some((n) => /reynis/i.test(n))).toBe(true);
    expect(names.some((n) => /jökuls|冰河湖/i.test(n))).toBe(true);
    expect(names.some((n) => /dettifoss|黛提/i.test(n))).toBe(true);
  });
});
