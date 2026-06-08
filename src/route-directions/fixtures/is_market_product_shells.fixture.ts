/**
 * 冰岛客源市场产品壳 — 与 IS-MPM v1 `canonical_route_id` 一一对应
 * @see data/country-packs/IS/market-preference-matrix.v1.json
 */

import { RouteDirection, RoutePhilosophy } from './types';

const baseCompliance = { requiresPermit: false, requiresGuide: false };

function shellPhilosophy(core: string, mustVisit: string[], minDays: number, maxDays: number): RoutePhilosophy {
  return {
    coreStatement: core,
    mustVisitTags: mustVisit,
    nonNegotiableRules: ['遵守 road.is / SafeTravel 官方路况与红警'],
    flexibleParts: ['住宿档次与具体酒店由预算与用户偏好细化'],
    durationFlexibility: { minDays, maxDays, preferredDays: Math.round((minDays + maxDays) / 2) },
  };
}

/** IS-SOUTH-GOLDEN-5-7-LUX — 美国高效度假 */
export const IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX_PHILOSOPHY = shellPhilosophy(
  '南岸+黄金圈经典地标深度体验，精品酒店与舒适节奏，弱化赶路与高地 F-road',
  ['黄金圈三大奇观', '南岸瀑布走廊', '杰古沙龙冰河湖', '蓝湖/设计酒店休憩'],
  5,
  7,
);

export const IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX: RouteDirection = {
  name: 'IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX',
  nameCN: '南岸与黄金圈奢华经典 5–7 日',
  nameEN: 'South Coast & Golden Circle Luxury Classic 5–7 Days',
  countryCode: 'IS',
  regions: ['Southwest Iceland', 'South Coast'],
  entryHubs: ['Reykjavík', 'KEF'],
  tags: ['golden-circle', 'south-coast', 'glacier-lagoon', 'iconic', 'spa', 'luxury', '自驾'],
  seasonality: { bestMonths: [6, 7, 8], avoidMonths: [11, 12, 1, 2, 3] },
  constraints: {
    hard: { rapidAscentForbidden: false, ...baseCompliance },
    soft: { maxDailyAscentM: 400, bufferTimeMin: 90 },
    objectives: { preferViewpoints: 0.35, preferHotSpring: 0.3, preferPhotography: 0.2 },
  },
  signaturePois: { examples: ['gullfoss', 'jokulsarlon', 'blue_lagoon'], weights: { gullfoss: 1, jokulsarlon: 0.9 } },
  itinerarySkeleton: { dayThemes: ['黄金圈', '南岸瀑布', '冰河湖', '温泉休整'], dailyPace: 'relaxed' },
  philosophy: IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX_PHILOSOPHY,
  narrative: {
    internal: 'IS_MARKET_US product shell',
    userFacing: '经典地标+高端住宿的舒适南岸与黄金圈深度游',
    philosophy: IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX_PHILOSOPHY.coreStatement,
  },
  riskProfile: { roadClosure: true, weatherWindow: false, level: 'low' },
  metadata: {
    routeType: 'ROAD_TRIP',
    archetype: 'RELAXED_LEISURE_VACATION',
    marketCanonicalId: 'IS-SOUTH-GOLDEN-5-7-LUX',
    marketSegmentId: 'IS_MARKET_US',
    vehicleRequired: '2wd_or_luxury_suv',
  },
};

/** IS-WINTER-REYK-AURORA-4-5 — 英国冬季短途 */
export const IS_MARKET_UK_WINTER_REYK_AURORA_4_5_PHILOSOPHY = shellPhilosophy(
  '雷克雅未克枢纽冬季短途：极光、冰洞、玻璃小屋与温泉，避免默认全岛环',
  ['极光夜观测', '冰洞（季窗）', '斯奈山半岛', '蓝湖/玻璃小屋'],
  4,
  5,
);

export const IS_MARKET_UK_WINTER_REYK_AURORA_4_5: RouteDirection = {
  name: 'IS_MARKET_UK_WINTER_REYK_AURORA_4_5',
  nameCN: '冬季雷克雅未克极光短途 4–5 日',
  nameEN: 'Winter Reykjavik Aurora Short Break 4–5 Days',
  countryCode: 'IS',
  regions: ['Capital Region', 'Snæfellsnes', 'South Coast'],
  entryHubs: ['Reykjavík'],
  tags: ['aurora', 'ice-cave', 'reykjavik-hub', 'snæfellsnes', 'glass-cabin', 'hot_springs', 'winter'],
  seasonality: { bestMonths: [11, 12, 1, 2, 3], avoidMonths: [6, 7, 8] },
  constraints: {
    hard: { rapidAscentForbidden: false, ...baseCompliance },
    soft: { maxDailyAscentM: 350, bufferTimeMin: 60 },
    objectives: { preferViewpoints: 0.25, preferHotSpring: 0.35, preferPhotography: 0.25 },
  },
  signaturePois: { examples: ['perlan', 'snaefellsnes', 'katla_ice_cave'], weights: { aurora: 1 } },
  itinerarySkeleton: { dayThemes: ['抵达+市区', '斯奈山', '南岸冰洞', '极光夜'], dailyPace: 'moderate' },
  philosophy: IS_MARKET_UK_WINTER_REYK_AURORA_4_5_PHILOSOPHY,
  narrative: {
    internal: 'IS_MARKET_UK product shell',
    userFacing: '冬季反季节短途：极光追寻与蓝冰洞，短半径高频度假感',
    philosophy: IS_MARKET_UK_WINTER_REYK_AURORA_4_5_PHILOSOPHY.coreStatement,
  },
  riskProfile: { roadClosure: true, weatherWindow: true, weatherWindowMonths: [11, 12, 1, 2, 3], level: 'medium' },
  metadata: {
    routeType: 'ROAD_TRIP',
    archetype: 'FJORD_COASTLINE_DRIVING',
    marketCanonicalId: 'IS-WINTER-REYK-AURORA-4-5',
    marketSegmentId: 'IS_MARKET_UK',
    vehicleRequired: '4x4_recommended_winter',
  },
};

/** IS-HIGHLANDS-WESTFJORDS-10-14 — 德北欧硬核 */
export const IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14_PHILOSOPHY = shellPhilosophy(
  '夏季内陆高地穿越 + 西峡湾小众线，强制 4x4，Landmannalaugar / Askja，弱化打卡团顺序',
  ['Landmannalaugar', 'Askja', '西峡湾 remoteness', 'F-road 合规穿越'],
  10,
  14,
);

export const IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14: RouteDirection = {
  name: 'IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14',
  nameCN: '高地穿越与西峡湾硬核 10–14 日',
  nameEN: 'Highlands & Westfjords Hardcore 10–14 Days',
  countryCode: 'IS',
  regions: ['Central Highlands', 'Westfjords'],
  entryHubs: ['Reykjavík'],
  tags: ['highlands', 'f-road', 'westfjords', 'landmannalaugar', 'askja', 'offbeat', 'camping', '4x4'],
  seasonality: { bestMonths: [6, 7, 8, 9], avoidMonths: [11, 12, 1, 2, 3, 4, 5] },
  constraints: {
    hard: { rapidAscentForbidden: true, requiresGuide: false, ...baseCompliance },
    soft: { maxDailyAscentM: 1200, maxSlopePct: 30, bufferTimeMin: 45 },
    objectives: { preferNature: 0.5, preferViewpoints: 0.3 },
  },
  signaturePois: { examples: ['landmannalaugar', 'askja', 'dynjandi'], weights: { landmannalaugar: 1, askja: 0.9 } },
  itinerarySkeleton: { dayThemes: ['高地入口', 'F-road 穿越', '西峡湾', '营地/徒步'], dailyPace: 'intense' },
  philosophy: IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14_PHILOSOPHY,
  narrative: {
    internal: 'IS_MARKET_DACH_NORDIC product shell',
    userFacing: '越野自驾与高地徒步的硬核自然线，遵守 DEM/Abu 门禁',
    philosophy: IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14_PHILOSOPHY.coreStatement,
  },
  riskProfile: {
    roadClosure: true,
    weatherWindow: true,
    weatherWindowMonths: [6, 7, 8, 9],
    level: 'high',
  },
  metadata: {
    routeType: 'ROAD_TRIP',
    archetype: 'ADVENTURE_CHALLENGE_ROUTE',
    marketCanonicalId: 'IS-HIGHLANDS-WESTFJORDS-10-14',
    marketSegmentId: 'IS_MARKET_DACH_NORDIC',
    vehicleRequired: '4x4_mandatory',
  },
};

/** IS-CINEMATIC-RING-9 — 东亚摄影美学 */
export const IS_MARKET_EAST_ASIA_CINEMATIC_RING_9_PHILOSOPHY = shellPhilosophy(
  '以出片光窗与孤独美学为线索的 9 日环岛：蝙蝠山、羽毛峡谷、飞机残骸、荒野设计民宿',
  ['Vestrahorn', 'Fjadrargljufur', 'DC-3 残骸', '黄金/蓝调光窗'],
  9,
  9,
);

export const IS_MARKET_EAST_ASIA_CINEMATIC_RING_9: RouteDirection = {
  name: 'IS_MARKET_EAST_ASIA_CINEMATIC_RING_9',
  nameCN: '冷酷仙境电影感环岛 9 日',
  nameEN: 'Cinematic Ring Road Photography 9 Days',
  countryCode: 'IS',
  regions: ['Iceland Ring'],
  entryHubs: ['Reykjavík', 'KEF'],
  tags: ['photography', 'cinematic', 'vesturhorn', 'plane-wreck', 'fjadrargljufur', 'design-lodge', 'ring-road', 'golden-hour'],
  seasonality: { bestMonths: [6, 7, 8, 9], avoidMonths: [] },
  constraints: {
    hard: { rapidAscentForbidden: false, ...baseCompliance },
    soft: { bufferTimeMin: 75 },
    objectives: { preferPhotography: 0.55, preferViewpoints: 0.35 },
  },
  signaturePois: {
    examples: ['vesturhorn', 'fjadrargljufur', 'solheimasandur_plane', 'stokksnes'],
    weights: { vesturhorn: 1, fjadrargljufur: 0.95 },
  },
  itinerarySkeleton: { dayThemes: ['南岸光窗', '东峡湾', '米湖', '西峡湾可选', '回程'], dailyPace: 'moderate' },
  philosophy: IS_MARKET_EAST_ASIA_CINEMATIC_RING_9_PHILOSOPHY,
  narrative: {
    internal: 'IS_MARKET_EAST_ASIA product shell',
    userFacing: '电影感与极简空间美学的摄影导向环岛',
    philosophy: IS_MARKET_EAST_ASIA_CINEMATIC_RING_9_PHILOSOPHY.coreStatement,
  },
  riskProfile: { roadClosure: true, weatherWindow: true, level: 'medium' },
  metadata: {
    routeType: 'ROAD_TRIP',
    archetype: 'NATURE_SCENIC_LOOP',
    marketCanonicalId: 'IS-CINEMATIC-RING-9',
    marketSegmentId: 'IS_MARKET_EAST_ASIA',
    vehicleRequired: '2wd_or_4x4',
  },
};

export const IS_MARKET_PRODUCT_SHELLS: RouteDirection[] = [
  IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX,
  IS_MARKET_UK_WINTER_REYK_AURORA_4_5,
  IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14,
  IS_MARKET_EAST_ASIA_CINEMATIC_RING_9,
];
