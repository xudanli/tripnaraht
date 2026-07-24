import type { RouteLineCoordinates } from '../config/iceland-route-detail.catalog';

/** 锚点间线性插值，便于 F 路在地图上形成连续路线网（Mapbox 通常不包含 F 路） */
export function densifyRouteLineAnchors(
  anchors: RouteLineCoordinates,
  pointsPerSegment = 12,
): RouteLineCoordinates {
  if (anchors.length < 2 || pointsPerSegment < 2) return anchors;

  const out: RouteLineCoordinates = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [fromLng, fromLat] = anchors[i]!;
    const [toLng, toLat] = anchors[i + 1]!;
    for (let j = 0; j < pointsPerSegment; j++) {
      if (out.length > 0 && j === 0) continue;
      const t = j / pointsPerSegment;
      out.push([
        fromLng + (toLng - fromLng) * t,
        fromLat + (toLat - fromLat) * t,
      ]);
    }
  }
  const last = anchors[anchors.length - 1]!;
  out.push(last);
  return out.length > 1 ? out : anchors;
}

export interface RouteMapLayerView {
  id: 'main' | 'fRoad';
  label: string;
  coordinates: RouteLineCoordinates;
  lineStyle: 'solid' | 'dashed';
  requires4wd?: boolean;
}

export function buildRouteMapLayers(map?: {
  mainLine?: RouteLineCoordinates;
  fRoadLine?: RouteLineCoordinates;
}): RouteMapLayerView[] {
  if (!map) return [];
  const layers: RouteMapLayerView[] = [];
  if (map.mainLine?.length) {
    layers.push({
      id: 'main',
      label: '主线路',
      coordinates: map.mainLine,
      lineStyle: 'solid',
    });
  }
  if (map.fRoadLine?.length) {
    layers.push({
      id: 'fRoad',
      label: 'F 路',
      coordinates: map.fRoadLine,
      lineStyle: 'dashed',
      requires4wd: true,
    });
  }
  return layers;
}

/** 生成候选地图 preview — mainLine + 加密 fRoadLine + 前端可直接绘制的 layers */
export function buildRouteMapPreview(map: {
  mainLine: RouteLineCoordinates;
  fRoadLine?: RouteLineCoordinates;
}) {
  const mainLine = map.mainLine;
  const fRoadLine = map.fRoadLine?.length
    ? densifyRouteLineAnchors(map.fRoadLine)
    : undefined;
  const normalized = { mainLine, ...(fRoadLine ? { fRoadLine } : {}) };
  return {
    ...normalized,
    layers: buildRouteMapLayers(normalized),
  };
}

/** 持久化 routeDetail 前加密 F 路锚点（Mapbox 不包含 F 路，仅线性插值成路线网） */
export function densifyRouteMapGeometry(map: {
  mainLine: RouteLineCoordinates;
  fRoadLine?: RouteLineCoordinates;
}) {
  if (!map.fRoadLine?.length) return map;
  return {
    ...map,
    fRoadLine: densifyRouteLineAnchors(map.fRoadLine),
  };
}
