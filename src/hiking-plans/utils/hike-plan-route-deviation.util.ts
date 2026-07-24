import type { HikePlanLiveEvent, HikePlanLiveState } from '../types/hike-plan.types';

export const DEFAULT_ROUTE_DEVIATION_THRESHOLD_M = 50;

const ROUTE_EVENT_ID = 'route-deviation';

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** 点到折线最短距离（米，局部平面近似） */
export function minDistanceToPolylineM(
  point: { lat: number; lng: number },
  polyline: Array<{ lat: number; lng: number }>,
): number | null {
  if (polyline.length < 2) return null;

  const lat0 = point.lat;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);

  const toXY = (p: { lat: number; lng: number }) => ({
    x: p.lng * mPerDegLng,
    y: p.lat * mPerDegLat,
  });

  const p = toXY(point);
  let min = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = toXY(polyline[i]);
    const b = toXY(polyline[i + 1]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = 0;
    if (len2 > 0) {
      t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
    }
    const qx = a.x + t * abx;
    const qy = a.y + t * aby;
    const dx = p.x - qx;
    const dy = p.y - qy;
    min = Math.min(min, Math.sqrt(dx * dx + dy * dy));
  }

  return Number.isFinite(min) ? min : null;
}

export function buildRouteDeviationEvent(
  distanceM: number,
  thresholdM: number,
  at = new Date().toISOString(),
): HikePlanLiveEvent {
  const current = Math.round(distanceM);
  const message = `您已偏离路线 ${current}m，建议回到轨迹`;
  return {
    id: ROUTE_EVENT_ID,
    type: 'route',
    at,
    message,
    noteZh: message,
    threshold: {
      metric: 'distance_m',
      current,
      value: thresholdM,
    },
  };
}

/** 更新 live-state：偏离则插入/替换 route 事件，回到轨迹则移除 */
export function applyRouteDeviationToLiveState(
  liveState: HikePlanLiveState,
  distanceM: number | null,
  thresholdM = DEFAULT_ROUTE_DEVIATION_THRESHOLD_M,
): HikePlanLiveState {
  const threshold =
    typeof liveState.routeDeviationThresholdM === 'number' &&
    liveState.routeDeviationThresholdM > 0
      ? liveState.routeDeviationThresholdM
      : thresholdM;

  const others = (liveState.events ?? []).filter((e) => e.type !== 'route');

  if (distanceM == null || distanceM <= threshold) {
    return { ...liveState, routeDeviationThresholdM: threshold, events: others };
  }

  return {
    ...liveState,
    routeDeviationThresholdM: threshold,
    events: [...others, buildRouteDeviationEvent(distanceM, threshold)],
  };
}
