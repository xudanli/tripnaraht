// scripts/svalbard/trailhead-identifier.ts
/**
 * 斯瓦尔巴徒步入口识别器
 * 
 * 识别徒步入口点，并关联最近的停车点，形成 "TrailAccessPoint"
 */

export interface TrailheadCandidate {
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  lat: number;
  lng: number;
  tags: Record<string, string>;
  name?: string;
  nameEN?: string;
}

export interface ParkingPoint {
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  lat: number;
  lng: number;
  tags: Record<string, string>;
  name?: string;
}

export interface TrailAccessPoint {
  trailhead: TrailheadCandidate;
  parking?: ParkingPoint;
  distanceToParking?: number; // 米
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

/**
 * 识别徒步入口点
 * 
 * 策略：
 * 1. 优先识别 highway=trailhead（强信号）
 * 2. 如果不足：找 tourism=information 且附近 50m 有 highway=path/footway
 * 3. 关联最近的停车点（amenity=parking）
 */
export function identifyTrailheads(
  candidates: TrailheadCandidate[],
  parkingPoints: ParkingPoint[],
  pathPoints?: Array<{ lat: number; lng: number }> // 可选的 path/footway 点
): TrailAccessPoint[] {
  const trailAccessPoints: TrailAccessPoint[] = [];

  for (const candidate of candidates) {
    const reasons: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'low';

    // 1. 检查是否为 trailhead
    if (candidate.tags.highway === 'trailhead') {
      confidence = 'high';
      reasons.push('强信号：highway=trailhead（OSM 专门标识的步道入口）');
    } else if (candidate.tags.tourism === 'information') {
      // 2. 检查附近是否有 path/footway
      if (pathPoints && pathPoints.length > 0) {
        const nearbyPath = findNearestPath(candidate.lat, candidate.lng, pathPoints, 50);
        if (nearbyPath) {
          confidence = 'medium';
          reasons.push('中等信号：tourism=information + 附近有步道（50m内）');
        } else {
          confidence = 'low';
          reasons.push('弱信号：tourism=information（但附近无步道）');
        }
      } else {
        confidence = 'medium';
        reasons.push('中等信号：tourism=information（信息板/地图板）');
      }
    } else {
      continue; // 跳过不符合条件的候选点
    }

    // 3. 查找最近的停车点
    const nearestParking = findNearestParking(
      candidate.lat,
      candidate.lng,
      parkingPoints,
      500 // 500米范围内
    );

    const trailAccessPoint: TrailAccessPoint = {
      trailhead: candidate,
      confidence,
      reasons,
    };

    if (nearestParking) {
      trailAccessPoint.parking = nearestParking.parking;
      trailAccessPoint.distanceToParking = nearestParking.distance;
      reasons.push(`关联停车点：距离 ${Math.round(nearestParking.distance)}m`);
    } else {
      reasons.push('未找到附近停车点（500m内）');
    }

    trailAccessPoints.push(trailAccessPoint);
  }

  // 按置信度排序
  const confidenceOrder = { high: 3, medium: 2, low: 1 };
  trailAccessPoints.sort(
    (a, b) => confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
  );

  return trailAccessPoints;
}

/**
 * 查找最近的停车点
 */
function findNearestParking(
  lat: number,
  lng: number,
  parkingPoints: ParkingPoint[],
  maxDistance: number = 500
): { parking: ParkingPoint; distance: number } | null {
  let nearest: { parking: ParkingPoint; distance: number } | null = null;
  let minDistance = Infinity;

  for (const parking of parkingPoints) {
    const distance = calculateDistance(lat, lng, parking.lat, parking.lng);
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      nearest = { parking, distance };
    }
  }

  return nearest;
}

/**
 * 查找最近的步道点
 */
function findNearestPath(
  lat: number,
  lng: number,
  pathPoints: Array<{ lat: number; lng: number }>,
  maxDistance: number = 50
): { lat: number; lng: number; distance: number } | null {
  let nearest: { lat: number; lng: number; distance: number } | null = null;
  let minDistance = Infinity;

  for (const point of pathPoints) {
    const distance = calculateDistance(lat, lng, point.lat, point.lng);
    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      nearest = { ...point, distance };
    }
  }

  return nearest;
}

/**
 * 计算两点之间的距离（米）
 * 使用 Haversine 公式
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

