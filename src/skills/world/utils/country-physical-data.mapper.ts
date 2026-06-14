/**
 * 将 CountryConfig 静态 JSON 映射为 PhysicalRealityModel 片段。
 */

import type {
  FerryState,
  HazardZoneState,
  PhysicalRealityModel,
  RoadState,
} from '../../../trips/decision/models/physical-reality.model';

function mapRoadStatusEntry(road: Record<string, unknown>): RoadState {
  const currentStatus = String(road.currentStatus ?? road.status ?? '').toLowerCase();
  const status: RoadState['status'] =
    currentStatus === 'open'
      ? 'OPEN'
      : currentStatus === 'closed'
        ? 'CLOSED'
        : String(road.status ?? '').toLowerCase() === 'seasonal'
          ? 'SEASONAL'
          : 'RESTRICTED';

  const requirements = road.requirements as Record<string, unknown> | undefined;
  const season = road.season as { openMonths?: number[] } | undefined;

  return {
    roadId: String(road.roadId ?? road.id ?? `road_${Date.now()}`),
    status,
    seasonOpenFrom: season?.openMonths?.[0],
    seasonOpenTo: season?.openMonths?.[season.openMonths?.length ? season.openMonths.length - 1 : 0],
    requires4x4: requirements?.vehicleType === '4x4_required' || road.roadType === 'F-road',
    requiresPermit: Boolean(requirements?.permitRequired),
    metadata: {
      roadName: road.roadName,
      roadType: road.roadType,
      requirements: road.requirements,
      hazards: road.hazards,
      source: 'country_config_static',
    },
  };
}

function mapHazardsFromRoad(road: Record<string, unknown>): HazardZoneState[] {
  const hazards = road.hazards;
  if (!Array.isArray(hazards)) return [];

  const roadId = String(road.roadId ?? road.id ?? 'road');
  return hazards.map((hazard: Record<string, unknown>, idx: number) => {
    const typeRaw = String(hazard.type ?? 'OTHER');
    const type: HazardZoneState['type'] =
      typeRaw === 'river_crossing'
        ? 'FLOOD'
        : typeRaw === 'weather_dependent'
          ? 'ICE'
          : 'OTHER';

    const sev = String(hazard.severity ?? 'medium');
    const level: HazardZoneState['level'] =
      sev === 'high' ? 'HIGH' : sev === 'low' ? 'LOW' : 'MEDIUM';

    const season = road.season as { openMonths?: number[] } | undefined;

    return {
      zoneId: `${roadId}_hazard_${idx}`,
      type,
      level,
      segmentId: roadId,
      seasonality: {
        highRiskMonths: season?.openMonths ?? [],
        lowRiskMonths: [],
      },
      metadata: {
        description: typeRaw,
        roadId,
        source: 'country_config_static',
      },
    };
  });
}

function mapFerryEntry(ferry: Record<string, unknown>): FerryState {
  const statusRaw = String(ferry.status ?? 'seasonal').toLowerCase();
  const status: FerryState['status'] =
    statusRaw === 'running'
      ? 'RUNNING'
      : statusRaw === 'cancelled'
        ? 'CANCELLED'
        : 'SEASONAL';

  const season = ferry.season as { openMonths?: number[] } | undefined;

  return {
    ferryId: String(ferry.ferryId ?? ferry.id ?? `ferry_${Date.now()}`),
    routeId: String(ferry.routeId ?? ferry.routeName ?? 'unknown'),
    status,
    seasonOpenFrom: season?.openMonths?.[0],
    seasonOpenTo: season?.openMonths?.[season.openMonths?.length ? season.openMonths.length - 1 : 0],
    metadata: { ...ferry, source: 'country_config_static' },
  };
}

export interface CountryPhysicalDataInput {
  roadStatusJson?: unknown;
  weatherWindowsJson?: unknown;
  ferrySchedulesJson?: unknown;
  countryCode: string;
  month: number;
}

export interface CountryPhysicalDataPatch {
  roadStates: RoadState[];
  hazardZones: HazardZoneState[];
  ferryStates: FerryState[];
  climateSeasonality?: PhysicalRealityModel['climateSeasonality'];
}

export function mapCountryPhysicalData(input: CountryPhysicalDataInput): CountryPhysicalDataPatch {
  const roadStates: RoadState[] = [];
  const hazardZones: HazardZoneState[] = [];
  const ferryStates: FerryState[] = [];
  let climateSeasonality: PhysicalRealityModel['climateSeasonality'] | undefined;

  const roads = Array.isArray(input.roadStatusJson)
    ? input.roadStatusJson
    : Array.isArray((input.roadStatusJson as any)?.roads)
      ? (input.roadStatusJson as any).roads
      : [];

  for (const road of roads) {
    if (!road || typeof road !== 'object') continue;
    roadStates.push(mapRoadStatusEntry(road as Record<string, unknown>));
    hazardZones.push(...mapHazardsFromRoad(road as Record<string, unknown>));
  }

  const ferries = (input.ferrySchedulesJson as any)?.ferries;
  if (Array.isArray(ferries)) {
    for (const ferry of ferries) {
      if (ferry && typeof ferry === 'object') {
        ferryStates.push(mapFerryEntry(ferry as Record<string, unknown>));
      }
    }
  }

  const regions = (input.weatherWindowsJson as any)?.regions;
  if (Array.isArray(regions)) {
    for (const region of regions) {
      const windows = region?.bestWindows;
      if (!Array.isArray(windows)) continue;
      for (const window of windows) {
        if (Array.isArray(window.months) && window.months.includes(input.month)) {
          climateSeasonality = {
            countryCode: input.countryCode,
            month: input.month,
            accessibilityScore: typeof window.score === 'number' ? window.score : 0.7,
            metadata: { notes: window.description ?? window.label },
          };
          break;
        }
      }
    }
  }

  return { roadStates, hazardZones, ferryStates, climateSeasonality };
}
