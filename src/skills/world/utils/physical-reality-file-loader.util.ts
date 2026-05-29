/**
 * 从 data/physical-reality/*.json 加载道路/天气静态切片（区域命名，非 ISO 直映射）
 */

import type { ClimateSeasonality, HazardZoneState, RoadState } from '../../../trips/decision/models/physical-reality.model';

function mapRoadStatus(raw: string | undefined): RoadState['status'] {
  const s = String(raw ?? 'open').toLowerCase();
  if (s === 'closed') return 'CLOSED';
  if (s === 'seasonal' || s === 'seasonal_closed') return 'SEASONAL';
  if (s === 'restricted' || s === 'conditional') return 'RESTRICTED';
  return 'OPEN';
}

export function parseRoadStatesFromPhysicalJson(data: unknown, source: string): RoadState[] {
  if (!data || typeof data !== 'object') return [];
  const roads = (data as { roads?: unknown[] }).roads;
  if (!Array.isArray(roads)) return [];

  const out: RoadState[] = [];
  for (const r of roads) {
    if (!r || typeof r !== 'object') continue;
    const road = r as Record<string, unknown>;
    const roadId = String(road.roadId ?? '').trim();
    if (!roadId) continue;
    const status = mapRoadStatus(
      (road.currentStatus as string) ?? (road.status as string),
    );
    const season = road.season as { openMonths?: number[] } | undefined;
    const openMonths = Array.isArray(season?.openMonths) ? season!.openMonths! : undefined;
    out.push({
      roadId,
      status,
      ...(openMonths?.length
        ? {
            seasonOpenFrom: Math.min(...openMonths),
            seasonOpenTo: Math.max(...openMonths),
          }
        : {}),
      requires4x4:
        typeof (road.requirements as any)?.vehicleType === 'string'
          ? String((road.requirements as any).vehicleType).includes('4x4')
          : undefined,
      metadata: {
        source,
        roadName: road.roadName,
        hazards: road.hazards,
      },
    });
  }
  return out;
}

export function parseHazardZonesFromRoadJson(data: unknown, month: number, source: string): HazardZoneState[] {
  const roads = (data as { roads?: unknown[] })?.roads;
  if (!Array.isArray(roads)) return [];
  const zones: HazardZoneState[] = [];
  for (const r of roads) {
    const road = r as Record<string, unknown>;
    const hazards = road.hazards;
    if (!Array.isArray(hazards) || hazards.length === 0) continue;
    const roadId = String(road.roadId ?? 'unknown');
    zones.push({
      zoneId: `road_hazard_${roadId}`,
      type: 'OTHER',
      level: 'MEDIUM',
      seasonality: { highRiskMonths: [month], lowRiskMonths: [] },
      metadata: { source, roadId, hazards },
    });
  }
  return zones;
}

/** 按月份从 weather-windows JSON 估算可达性（静态推断，非实时） */
export function parseClimateSeasonalityFromWeatherJson(
  data: unknown,
  countryCode: string,
  month: number,
): ClimateSeasonality | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const regions = (data as { regions?: unknown[] }).regions;
  if (!Array.isArray(regions) || regions.length === 0) return undefined;

  const region = regions[0] as Record<string, unknown>;
  const bestWindows = region.bestWindows as Array<{ months?: number[] }> | undefined;
  const riskLevels = region.riskLevels as Array<{ month?: number; level?: string }> | undefined;

  let accessibilityScore = 0.55;
  if (Array.isArray(bestWindows)) {
    const inBest = bestWindows.some((w) => Array.isArray(w.months) && w.months.includes(month));
    if (inBest) accessibilityScore = 0.85;
  }
  if (Array.isArray(riskLevels)) {
    const rl = riskLevels.find((x) => x.month === month);
    if (rl?.level === 'HIGH') accessibilityScore = Math.min(accessibilityScore, 0.35);
    if (rl?.level === 'LOW') accessibilityScore = Math.max(accessibilityScore, 0.75);
  }

  return {
    countryCode,
    month,
    accessibilityScore,
    typicalWeather: {
      windSpeedMps: 8,
      precipitationMmPerHour: 1,
      visibilityMeters: 5000,
      temperatureCelsius: 8,
    },
    riskFactors: accessibilityScore < 0.5 ? ['weather', 'seasonal_access'] : [],
  };
}
