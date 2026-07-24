/** Laugavegur 融资 Demo 样板间常量 */

export const ROUTE_DIRECTION_NAME = 'IS_LAUGAVEGUR';

export const LAUGAVEGUR_POLYLINE_POI_IDS = [
  'froad-landmannalaugar',
  'hut-landmannalaugar',
  'hut-nyidalur',
  'froad-thorsmork',
  'hut-thorsmork',
] as const;

export const LAUGAVEGUR_SUPPLY_POI_IDS = [
  'hut-landmannalaugar',
  'hut-nyidalur',
  'hut-thorsmork',
] as const;

/** 高地 F 路 POI 坐标（与 data/iceland/highland-froad-pois.json 对齐） */
export const LAUGAVEGUR_ROUTE_POINTS: Array<{ lat: number; lng: number; label?: string }> = [
  { lat: 63.993, lng: -19.0618, label: 'Landmannalaugar' },
  { lat: 63.93, lng: -19.2, label: 'Hrafntinnusker area' },
  { lat: 63.86, lng: -19.35, label: 'Álftavatn area' },
  { lat: 63.78, lng: -19.42, label: 'Emstrur area' },
  { lat: 63.68, lng: -19.48, label: 'Þórsmörk' },
];

export type LaugavegurDaySkeleton = {
  day: number;
  titleZh: string;
  titleEn: string;
  distanceKm: number;
  ascentM: number;
  hutPoiId?: string;
  notes?: string;
};

export const LAUGAVEGUR_DAY_SKELETON: LaugavegurDaySkeleton[] = [
  {
    day: 1,
    titleZh: 'Landmannalaugar → Hrafntinnusker',
    titleEn: 'Landmannalaugar to Hrafntinnusker',
    distanceKm: 12,
    ascentM: 470,
    hutPoiId: 'hut-landmannalaugar',
    notes: '彩色流纹岩高地，首日爬升集中',
  },
  {
    day: 2,
    titleZh: 'Hrafntinnusker → Álftavatn',
    titleEn: 'Hrafntinnusker to Álftavatn',
    distanceKm: 12,
    ascentM: 100,
    hutPoiId: 'hut-nyidalur',
  },
  {
    day: 3,
    titleZh: 'Álftavatn → Emstrur',
    titleEn: 'Álftavatn to Emstrur',
    distanceKm: 15,
    ascentM: 200,
    notes: '融水河流建议早晨涉水',
  },
  {
    day: 4,
    titleZh: 'Emstrur → Þórsmörk',
    titleEn: 'Emstrur to Þórsmörk',
    distanceKm: 16,
    ascentM: 150,
    hutPoiId: 'hut-thorsmork',
    notes: '三冰川峡谷终点',
  },
];

/** 与 Laugavegur 同走廊的 7 日荒野线（4 日核心段 + 休整/下撤） */
export const IS_TREKKING_WILDERNESS_DAY_SKELETON: LaugavegurDaySkeleton[] = [
  ...LAUGAVEGUR_DAY_SKELETON,
  {
    day: 5,
    titleZh: 'Þórsmörk 营地休整 / 侧线探路',
    titleEn: 'Þórsmörk rest & side trails',
    distanceKm: 8,
    ascentM: 180,
    hutPoiId: 'hut-thorsmork',
    notes: '可选留在 Þórsmörk，恢复体能',
  },
  {
    day: 6,
    titleZh: 'Emstrur–Þórsmörk 缓冲日（天气/过河）',
    titleEn: 'Weather or river buffer day',
    distanceKm: 6,
    ascentM: 120,
    notes: '融水河或大风时可在此加休',
  },
  {
    day: 7,
    titleZh: 'Þórsmörk → Seljalandsfoss 下撤接驳',
    titleEn: 'Exit to Seljalandsfoss shuttle',
    distanceKm: 14,
    ascentM: 90,
    notes: '4x4 / 巴士接驳出高地',
  },
];
