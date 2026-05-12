// src/skills/dem/dem-get-profile-input.adapter.ts
/**
 * Agentic 路径输入归一化：RESEARCH / 编排可能传 destination / origin，
 * 工作台与 geo 技能传 polyline。统一为 DemGetProfileSkill 所需的 polyline（≥2 点）。
 *
 * Internal Path（DEMEffortMetadataService 等）不经过本适配器。
 *
 * 另：`inferDemElevationDataQuality` 用于在输出侧标记栅格缺口/可疑全零海拔，便于 telemetry。
 */

export interface DemGetProfileNormalizedInput {
  polyline: Array<{ lat: number; lng: number }>;
  samples?: number;
}

export type DemGetProfileLooseInput = {
  polyline?: Array<{ lat: number; lng: number }>;
  samples?: number;
  destination?: string | { lat: number; lng: number };
  origin?: string | { lat: number; lng: number };
};

function finiteCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * 从「地名串」或坐标对象中解析出一个经纬度点；无法解析则返回 null。
 */
export function parseLatLngFromUnknown(value: string | { lat: number; lng: number } | undefined): {
  lat: number;
  lng: number;
} | null {
  if (value == null) return null;
  if (typeof value === 'object' && 'lat' in value && 'lng' in value) {
    const lat = Number((value as { lat: number }).lat);
    const lng = Number((value as { lng: number }).lng);
    return finiteCoord(lat, lng) ? { lat, lng } : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    return finiteCoord(lat, lng) ? { lat, lng } : null;
  }
  return null;
}

/** DEM 栅格/降级路径可信度，供 dem_metrics telemetry 与 verify 链参考 */
export type DemElevationDataQuality = 'high' | 'low' | 'unknown';

/**
 * 根据剖面与距离启发式推断数据质量（PostGIS 缝隙、全零海拔、未走 effort 服务等）。
 */
export function inferDemElevationDataQuality(opts: {
  usedEffortService: boolean;
  elevationProfile: Array<{ elevation: number; slope?: number }>;
  totalDistanceM: number;
  totalAscentM: number;
  maxSlopePct: number;
}): DemElevationDataQuality {
  const { usedEffortService, elevationProfile, totalDistanceM, totalAscentM, maxSlopePct } = opts;
  if (!usedEffortService || elevationProfile.length === 0) {
    return 'unknown';
  }
  const elevs = elevationProfile.map((p) => p.elevation).filter((e) => Number.isFinite(e));
  if (elevs.length === 0) {
    return 'unknown';
  }
  const allZero = elevs.every((e) => e === 0);
  const trivialDistance = totalDistanceM < 1;
  if (trivialDistance) {
    return allZero ? 'unknown' : 'high';
  }
  if (allZero && totalDistanceM > 200) {
    return 'low';
  }
  if (totalDistanceM > 500 && totalAscentM === 0 && maxSlopePct < 0.01) {
    return 'low';
  }
  return 'high';
}

/**
 * 将多种「野参数」形态收敛为 { polyline, samples }。
 * @throws 当无法构造至少 2 个有效点时
 */
export function normalizeDemGetProfileInput(raw: DemGetProfileLooseInput | Record<string, unknown>): DemGetProfileNormalizedInput {
  const samples =
    typeof (raw as DemGetProfileLooseInput).samples === 'number'
      ? (raw as DemGetProfileLooseInput).samples
      : undefined;

  const poly = (raw as DemGetProfileLooseInput).polyline;
  if (Array.isArray(poly) && poly.length >= 2) {
    const out = poly
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => finiteCoord(p.lat, p.lng));
    if (out.length >= 2) {
      return { polyline: out, samples };
    }
  }

  if (Array.isArray(poly) && poly.length === 1) {
    const p0 = poly[0];
    const lat = Number(p0.lat);
    const lng = Number(p0.lng);
    if (finiteCoord(lat, lng)) {
      return { polyline: [{ lat, lng }, { lat, lng }], samples };
    }
  }

  const loose = raw as DemGetProfileLooseInput;
  const o = parseLatLngFromUnknown(loose.origin);
  const d = parseLatLngFromUnknown(loose.destination);

  if (o && d) {
    return { polyline: [o, d], samples };
  }
  if (d) {
    return { polyline: [d, d], samples };
  }
  if (o) {
    return { polyline: [o, o], samples };
  }

  throw new Error(
    'dem.get_profile: 需要 polyline（至少 2 点）或带经纬度的 destination/origin（如 {lat,lng} 或 "64.1,-21.9"）',
  );
}
