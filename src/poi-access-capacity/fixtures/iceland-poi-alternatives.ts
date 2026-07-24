/**
 * 冰岛 POI 替代方案 — Neptune REPLACE / Plan B 用
 */

export type IcelandPoiAlternative = {
  poiId: string;
  name: string;
  nameEN?: string;
  reason?: string;
};

/** blocked poiId → 可替换候选（按优先级） */
export const ICELAND_POI_ALTERNATIVES: Record<string, IcelandPoiAlternative[]> = {
  'is.landmannalaugar': [
    {
      poiId: 'is.landmannalaugar.bus',
      name: 'Landmannalaugar 高地巴士站',
      nameEN: 'Landmannalaugar Highland Bus',
      reason: '改乘高地巴士，无需自驾停车预约',
    },
  ],
  'is.blue_lagoon': [
    {
      poiId: 'is.sky_lagoon',
      name: 'Sky Lagoon',
      nameEN: 'Sky Lagoon',
      reason: '同类温泉体验，时段库存压力通常较低',
    },
  ],
  'is.skaftafell': [
    {
      poiId: 'is.skaftafell.visitor_center',
      name: 'Skaftafell 游客中心',
      nameEN: 'Skaftafell Visitor Centre',
      reason: '步道关闭时可游览开放区域与低海拔路线',
    },
    {
      poiId: 'is.svinafellsjokull',
      name: 'Svínafellsjökull 冰川',
      nameEN: 'Svínafellsjökull Glacier',
      reason: '邻近冰川观景点，常作为 Skaftafell 替代',
    },
  ],
  'is.dyrholaey': [
    {
      poiId: 'is.reynisfjara',
      name: 'Reynisfjara 黑沙滩',
      nameEN: 'Reynisfjara Black Sand Beach',
      reason: 'Dyrhólaey 繁殖期限制时，可改访南岸黑沙滩',
    },
  ],
  'is.dettifoss': [
    {
      poiId: 'is.dettifoss.east',
      name: 'Dettifoss 东侧观景点',
      nameEN: 'Dettifoss East Viewpoint',
      reason: 'F862 西侧 F 路不可行时，改走东侧 864 铺装路',
    },
  ],
  'is.gullfoss': [
    {
      poiId: 'is.geysir',
      name: 'Geysir 间歇泉',
      nameEN: 'Geysir Geothermal Area',
      reason: '黄金圈相邻景点，停车压力相错时可互换时段',
    },
  ],
  'is.seljalandsfoss': [
    {
      poiId: 'is.skogafoss',
      name: 'Skógafoss',
      nameEN: 'Skógafoss',
      reason: '南岸瀑布相邻，可错峰互换',
    },
  ],
};

export function getPrimaryAlternative(poiId: string): IcelandPoiAlternative | undefined {
  return ICELAND_POI_ALTERNATIVES[poiId]?.[0];
}

export function appendAlternativePlanB(
  poiId: string,
  existing: import('../interfaces/poi-access-capacity.interface').AccessCapacityPlanB[],
): import('../interfaces/poi-access-capacity.interface').AccessCapacityPlanB[] {
  const alt = getPrimaryAlternative(poiId);
  if (!alt) return existing;
  if (existing.some((p) => p.alternativePoiId === alt.poiId)) return existing;
  return [
    ...existing,
    {
      action: 'USE_ALTERNATIVE',
      detail: alt.reason ?? `改选 ${alt.name}`,
      alternativePoiId: alt.poiId,
    },
  ];
}
