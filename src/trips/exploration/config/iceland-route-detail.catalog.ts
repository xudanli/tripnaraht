/** 路线详情 — 地图与每日锚点 SSOT（冰岛 MVP） */

import { buildRouteMapPreview } from '../utils/route-map-geometry.util';

export type RouteBadgeTone = 'niche' | 'balanced' | 'classic' | 'intense';

export interface RouteMapPoint {
  lng: number;
  lat: number;
}

export interface RouteDayDetail {
  day: number;
  theme: string;
  route: string;
  driving: string;
  experience: string;
  stay: string;
  mapPoint: RouteMapPoint;
  tip?: string;
  highlight?: boolean;
}

/** [lng, lat] WGS84 — GeoJSON 顺序 */
export type RouteLineCoordinates = Array<[number, number]>;

export interface RouteMapGeometry {
  mainLine: RouteLineCoordinates;
  fRoadLine?: RouteLineCoordinates;
}

export interface ExplorationRouteDetailPayload {
  summary: string;
  totalKm: number;
  avgDrivingHours: number;
  stayChanges: number;
  regions: string[];
  highlights: string[];
  preparations: string[];
  days: RouteDayDetail[];
  map: RouteMapGeometry;
  /** CPRE 解析结果 — generateCandidates 后写入 routeDetail JSON；详情 API 返回时保证存在 */
  resolvedPois?: ExplorationResolvedPoiRef[];
  /** LLM / 模板显式输出的 POI mention 列表（优先于纯文本扫描） */
  poiMentions?: string[];
}

/** CPRE 接入 — 候选/详情中的 POI 解析状态 */
export interface ExplorationResolvedPoiRef {
  name: string;
  resolved: boolean;
  poiId?: string;
  confidence?: number;
  method?: string;
  status?: string;
  canonicalName?: string;
}

export interface ExplorationRouteDetailCatalogEntry {
  strategyId: string;
  routeId: string;
  title: string;
  tagline: string;
  badge: { label: string; tone: RouteBadgeTone };
  detail: ExplorationRouteDetailPayload;
}

/** 冰岛常用锚点 [lng, lat] */
const PT = {
  reykjavik: [-21.9426, 64.1466] as [number, number],
  goldenCircle: [-20.302, 64.255] as [number, number],
  vik: [-19.0083, 63.4186] as [number, number],
  jokulsarlon: [-16.1783, 64.0475] as [number, number],
  hofn: [-15.2083, 64.2539] as [number, number],
  egilsstadir: [-14.3948, 65.2637] as [number, number],
  myvatn: [-16.7283, 65.6035] as [number, number],
  akureyri: [-18.0878, 65.6835] as [number, number],
  highlandAskja: [-16.7283, 65.0467] as [number, number],
  f208Spur: [-18.6, 64.35] as [number, number],
  /** F208 北段 — Mývatn → Askja 方向 */
  f208NorthMid: [-16.85, 65.35] as [number, number],
  /** F208 中段 */
  f208Central: [-17.35, 64.85] as [number, number],
  /** Landmannalaugar / F208 南段枢纽 */
  landmannalaugar: [-19.06, 63.99] as [number, number],
  seljalandsfoss: [-19.9886, 63.6156] as [number, number],
};

export const ICELAND_ROUTE_DETAIL_CATALOG: ExplorationRouteDetailCatalogEntry[] = [
  {
    strategyId: 'depth-south-coast',
    routeId: 'route_depth-south-coast',
    title: '南岸深度',
    tagline: '少赶路，把体验集中在南岸与黄金圈',
    badge: { label: '轻松深度', tone: 'balanced' },
    detail: {
      summary: '少赶路，把体验集中在南岸与黄金圈，适合希望轻松停留的旅行者。',
      totalKm: 620,
      avgDrivingHours: 2.4,
      stayChanges: 3,
      regions: ['雷克雅未克', '黄金圈', '南岸'],
      highlights: ['黄金圈三大景点集中游览', '南岸瀑布与黑沙滩深度停留', '每日驾驶时间可控'],
      preparations: ['2WD 即可覆盖本路线', '南岸风大，备好防风外套'],
      days: [
        {
          day: 1,
          theme: '抵达与市区',
          route: '抵达 → 雷克雅未克',
          driving: '0.5h',
          experience: '市区休整、采购补给',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
        {
          day: 2,
          theme: '黄金圈',
          route: '雷克雅未克 → 黄金圈 → 雷克雅未克',
          driving: '2.5h',
          experience: '间歇泉、黄金瀑布、辛格维利尔',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.goldenCircle[0], lat: PT.goldenCircle[1] },
        },
        {
          day: 3,
          theme: '南岸西段',
          route: '雷克雅未克 → 塞里雅兰瀑布 → Vík',
          driving: '2.8h',
          experience: 'Seljalandsfoss、Skógafoss 与南岸海岸',
          stay: 'Vík',
          mapPoint: { lng: PT.seljalandsfoss[0], lat: PT.seljalandsfoss[1] },
        },
        {
          day: 4,
          theme: '黑沙滩与玄武岩',
          route: 'Vík 周边',
          driving: '1.5h',
          experience: 'Reynisfjara 黑沙滩、迪霍拉利角',
          stay: 'Vík',
          mapPoint: { lng: PT.vik[0], lat: PT.vik[1] },
        },
        {
          day: 5,
          theme: '冰川与冰河湖',
          route: 'Vík → 杰古沙龙冰河湖',
          driving: '2.5h',
          experience: 'Jökulsárlón 冰河湖、Skaftafell 冰川徒步',
          stay: 'Höfn 附近',
          mapPoint: { lng: PT.jokulsarlon[0], lat: PT.jokulsarlon[1] },
        },
        {
          day: 6,
          theme: '东岸缓冲',
          route: 'Höfn → 东部峡湾观景',
          driving: '2.0h',
          experience: '渔村与海岸线',
          stay: 'Höfn',
          mapPoint: { lng: PT.hofn[0], lat: PT.hofn[1] },
        },
        {
          day: 7,
          theme: '返程南岸',
          route: 'Höfn → Vík',
          driving: '3.0h',
          experience: '补访遗漏景点',
          stay: 'Vík',
          mapPoint: { lng: PT.vik[0], lat: PT.vik[1] },
        },
        {
          day: 8,
          theme: '回首都',
          route: 'Vík → 雷克雅未克',
          driving: '2.5h',
          experience: '蓝湖或市区自由活动',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
        {
          day: 9,
          theme: '离境',
          route: '雷克雅未克 → 机场',
          driving: '0.5h',
          experience: '返程',
          stay: '—',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
      ],
      map: {
        mainLine: [
          PT.reykjavik,
          PT.goldenCircle,
          PT.reykjavik,
          PT.seljalandsfoss,
          PT.vik,
          PT.jokulsarlon,
          PT.hofn,
          PT.vik,
          PT.reykjavik,
        ],
      },
    },
  },
  {
    strategyId: 'coverage-ring-compressed',
    routeId: 'route_coverage-ring-compressed',
    title: '环岛压缩',
    tagline: '尽可能覆盖更多冰岛区域，驾驶强度更高',
    badge: { label: '经典环岛', tone: 'classic' },
    detail: {
      summary: '尽可能覆盖更多冰岛区域，驾驶强度更高，适合时间有限但想看更多地方的旅行者。',
      totalKm: 1320,
      avgDrivingHours: 4.2,
      stayChanges: 6,
      regions: ['南岸', '东部', '北部', '西部'],
      highlights: ['环岛经典动线一次看完', '米湖与 Akureyri 北部体验', '景观类型丰富'],
      preparations: ['建议 4WD 以应对北部风况与 gravel', '每日出发宜早，预留缓冲'],
      days: [
        {
          day: 1,
          theme: '抵达',
          route: '雷克雅未克',
          driving: '0.5h',
          experience: '市区休整',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
        {
          day: 2,
          theme: '黄金圈 + 南岸',
          route: '雷克雅未克 → Vík',
          driving: '3.5h',
          experience: 'Geysir、Gullfoss、Seljalandsfoss、Skógafoss、Reynisfjara',
          stay: 'Vík',
          mapPoint: { lng: PT.vik[0], lat: PT.vik[1] },
        },
        {
          day: 3,
          theme: '冰河湖东进',
          route: 'Vík → Höfn',
          driving: '3.0h',
          experience: 'Jökulsárlón 与 Höfn 东部海岸',
          stay: 'Höfn',
          mapPoint: { lng: PT.hofn[0], lat: PT.hofn[1] },
        },
        {
          day: 4,
          theme: '东部峡湾',
          route: 'Höfn → Egilsstaðir',
          driving: '3.5h',
          experience: '峡湾与渔村',
          stay: 'Egilsstaðir',
          mapPoint: { lng: PT.egilsstadir[0], lat: PT.egilsstadir[1] },
        },
        {
          day: 5,
          theme: '北部米湖',
          route: 'Egilsstaðir → 米湖',
          driving: '3.8h',
          experience: 'Dettifoss、米湖地热区',
          stay: 'Mývatn',
          mapPoint: { lng: PT.myvatn[0], lat: PT.myvatn[1] },
        },
        {
          day: 6,
          theme: 'Akureyri',
          route: '米湖 → Akureyri',
          driving: '1.5h',
          experience: '北部最大城镇与鲸鱼湾',
          stay: 'Akureyri',
          mapPoint: { lng: PT.akureyri[0], lat: PT.akureyri[1] },
        },
        {
          day: 7,
          theme: '西部回穿',
          route: 'Akureyri → 雷克雅未克（西线）',
          driving: '5.0h',
          experience: '长途驾驶日，Snæfellsnes 可选',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
          tip: '本日驾驶较长，建议早出发',
        },
        {
          day: 8,
          theme: '缓冲日',
          route: '雷克雅未克周边',
          driving: '1.5h',
          experience: '补访或蓝湖',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
        {
          day: 9,
          theme: '离境',
          route: '雷克雅未克 → 机场',
          driving: '0.5h',
          experience: '返程',
          stay: '—',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
      ],
      map: {
        mainLine: [
          PT.reykjavik,
          PT.vik,
          PT.jokulsarlon,
          PT.hofn,
          PT.egilsstadir,
          PT.myvatn,
          PT.akureyri,
          PT.reykjavik,
        ],
      },
    },
  },
  {
    strategyId: 'remote-highlands-south',
    routeId: 'route_remote-highlands-south',
    title: '高地探索 + 南岸',
    tagline: '门槛更高，换来更少游客与更强荒野体验',
    badge: { label: '小众路线', tone: 'niche' },
    detail: {
      summary: '门槛更高，换来更少游客与更强荒野体验',
      totalKm: 960,
      avgDrivingHours: 3.6,
      stayChanges: 4,
      regions: ['南岸', '高地'],
      highlights: [
        '高地独特地貌与低游客密度',
        'F 路探索与地热景观',
        '南岸经典与高地组合',
      ],
      preparations: [
        '需合规四驱并有涉水能力',
        '出发前确认 F 路开放状态与天气预报',
        '备足燃料与离线地图',
      ],
      days: [
        {
          day: 1,
          theme: '南岸热身',
          route: '雷克雅未克 → 南岸',
          driving: '2.8h',
          experience: 'Seljalandsfoss、Reynisfjara、Dyrhólaey',
          stay: 'Vík',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
        {
          day: 2,
          theme: '南岸深度',
          route: 'Vík → 冰河湖',
          driving: '2.5h',
          experience: 'Jökulsárlón 冰河湖',
          stay: 'Höfn 附近',
          mapPoint: { lng: PT.jokulsarlon[0], lat: PT.jokulsarlon[1] },
        },
        {
          day: 3,
          theme: '东部缓冲',
          route: 'Höfn → Egilsstaðir',
          driving: '3.0h',
          experience: '峡湾风光',
          stay: 'Egilsstaðir',
          mapPoint: { lng: PT.egilsstadir[0], lat: PT.egilsstadir[1] },
        },
        {
          day: 4,
          theme: '北上米湖',
          route: 'Egilsstaðir → 米湖',
          driving: '3.2h',
          experience: '地热区与火山口',
          stay: 'Mývatn',
          mapPoint: { lng: PT.myvatn[0], lat: PT.myvatn[1] },
        },
        {
          day: 5,
          theme: '进入高地区域',
          route: '米湖 → Askja 高地',
          driving: '4.2h',
          experience: '高地 F 路、地热景观',
          stay: '高地 hut/露营',
          tip: '部分道路有车辆要求',
          highlight: true,
          mapPoint: { lng: PT.highlandAskja[0], lat: PT.highlandAskja[1] },
        },
        {
          day: 6,
          theme: '高地退出',
          route: '高地 → 南岸回穿',
          driving: '4.0h',
          experience: 'Askja 高地、Landmannalaugar',
          stay: 'Vík',
          mapPoint: { lng: PT.f208Spur[0], lat: PT.f208Spur[1] },
        },
        {
          day: 7,
          theme: '南岸补访',
          route: 'Vík 周边',
          driving: '1.8h',
          experience: '黑沙滩与观鸟',
          stay: 'Vík',
          mapPoint: { lng: PT.vik[0], lat: PT.vik[1] },
        },
        {
          day: 8,
          theme: '回首都',
          route: 'Vík → 雷克雅未克',
          driving: '2.5h',
          experience: '市区休整',
          stay: 'Reykjavik',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
        {
          day: 9,
          theme: '离境',
          route: '雷克雅未克 → 机场',
          driving: '0.5h',
          experience: '返程',
          stay: '—',
          mapPoint: { lng: PT.reykjavik[0], lat: PT.reykjavik[1] },
        },
      ],
      map: {
        mainLine: [
          PT.reykjavik,
          PT.vik,
          PT.jokulsarlon,
          PT.hofn,
          PT.egilsstadir,
          PT.myvatn,
          PT.vik,
          PT.reykjavik,
        ],
        fRoadLine: [
          PT.myvatn,
          PT.f208NorthMid,
          PT.highlandAskja,
          PT.f208Central,
          PT.f208Spur,
          PT.landmannalaugar,
          PT.vik,
        ],
      },
    },
  },
];

export function resolveIcelandRouteDetail(
  routeIdOrStrategyId: string,
): ExplorationRouteDetailCatalogEntry | null {
  const key = routeIdOrStrategyId.trim();
  return (
    ICELAND_ROUTE_DETAIL_CATALOG.find(
      (e) => e.routeId === key || e.strategyId === key,
    ) ?? null
  );
}

/** 候选列表轻量预览（含 map 折线 + F 路 layers，不含完整 days） */
export function buildRouteDetailPreview(entry: ExplorationRouteDetailCatalogEntry) {
  return {
    summary: entry.detail.summary,
    totalKm: entry.detail.totalKm,
    avgDrivingHours: entry.detail.avgDrivingHours,
    regions: entry.detail.regions,
    map: buildRouteMapPreview(entry.detail.map),
  };
}
