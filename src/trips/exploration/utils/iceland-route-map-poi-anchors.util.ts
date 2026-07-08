import type {
  ExplorationRouteDetailPayload,
  RouteLineCoordinates,
  RouteMapPoint,
} from '../config/iceland-route-detail.catalog';

/** 地图锚点 → CPRE mention（与 iceland-route-detail.catalog PT 对齐） */
export const ICELAND_ROUTE_MAP_ANCHOR_POIS: ReadonlyArray<{
  lng: number;
  lat: number;
  mentions: readonly string[];
}> = [
  { lng: -20.302, lat: 64.255, mentions: ['Geysir', 'Gullfoss', 'Þingvellir National Park'] },
  { lng: -19.9886, lat: 63.6156, mentions: ['Seljalandsfoss', 'Skógafoss'] },
  { lng: -19.0083, lat: 63.4186, mentions: ['Reynisfjara', 'Dyrhólaey'] },
  { lng: -16.1783, lat: 64.0475, mentions: ['Jökulsárlón', 'Skaftafell'] },
  { lng: -15.2083, lat: 64.2539, mentions: ['Jökulsárlón'] },
  { lng: -16.7283, lat: 65.6035, mentions: ['Dettifoss'] },
  { lng: -16.7283, lat: 65.0467, mentions: ['Askja'] },
  { lng: -19.06, lat: 63.99, mentions: ['Landmannalaugar'] },
  { lng: -16.78, lat: 65.6, mentions: ['Mývatn', '米湖'] },
  { lng: -17.55, lat: 65.68, mentions: ['Goðafoss', '神之瀑布'] },
  { lng: -17.53, lat: 63.77, mentions: ['Fjaðrárgljúfur', '羽毛峡谷'] },
];

const COORD_EPS = 0.025;

function coordMatches(a: { lng: number; lat: number }, b: { lng: number; lat: number }): boolean {
  return Math.abs(a.lng - b.lng) <= COORD_EPS && Math.abs(a.lat - b.lat) <= COORD_EPS;
}

function mentionsForCoord(lng: number, lat: number): string[] {
  const out: string[] = [];
  for (const anchor of ICELAND_ROUTE_MAP_ANCHOR_POIS) {
    if (coordMatches({ lng, lat }, anchor)) {
      out.push(...anchor.mentions);
    }
  }
  return out;
}

function collectCoords(
  routeDetail?: Pick<ExplorationRouteDetailPayload, 'map' | 'days'> | null,
): Array<{ lng: number; lat: number }> {
  if (!routeDetail) return [];
  const coords: Array<{ lng: number; lat: number }> = [];

  const pushLine = (line?: RouteLineCoordinates) => {
    for (const [lng, lat] of line ?? []) {
      coords.push({ lng, lat });
    }
  };

  pushLine(routeDetail.map?.mainLine);
  pushLine(routeDetail.map?.fRoadLine);

  for (const day of routeDetail.days ?? []) {
    if (day.mapPoint) coords.push(day.mapPoint);
  }

  return coords;
}

/** 从 map 折线与每日 mapPoint 推断途经 POI mention */
export function extractMapAnchorPoiMentions(
  routeDetail?: Pick<ExplorationRouteDetailPayload, 'map' | 'days'> | null,
): string[] {
  const mentions: string[] = [];
  for (const { lng, lat } of collectCoords(routeDetail)) {
    mentions.push(...mentionsForCoord(lng, lat));
  }
  return mentions;
}
