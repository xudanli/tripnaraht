/**
 * ROR 世界态装载：Weather（Open-Meteo）+ Road（OntologyRoadStatus）+ Route Matrix + 日照估算。
 */

import type { ObservationScope } from './reality-observation.types';
import {
  loadRouteTravelTimeMatrixForRor,
  type RorGoogleRoutesPort,
  type RorRouteLegInput,
} from './route-matrix-ror-loader';
import { resolveWeatherGeoForRor } from './ror-weather-geo.util';

export type RorWeatherPort = {
  isServiceAvailable?: () => boolean;
  getCurrentWeather: (city: string) => Promise<{
    temperature?: number;
    wind_speed?: number;
    weather_code?: number;
    humidity?: number;
    [k: string]: unknown;
  } | null>;
};

export type RorRoadPort = {
  summarizeForOntologyNodeIds: (
    ids: readonly string[],
  ) => Promise<
    Map<
      string,
      {
        ontologyNodeId: string;
        aggregateAccessState: string;
        segments: Array<{
          roadQueryKey: string;
          accessState: string;
          condition?: string;
          condition_text?: string;
        }>;
      }
    >
  >;
};

/** 冰岛常见区域本体节点（无更细 scope 时的保守默认） */
export const ROR_DEFAULT_IS_ROAD_ONTOLOGY_NODES = [
  'ontology:region:IS:SNAEFELLSNES',
  'ontology:region:IS:SOUTH_COAST',
  'ontology:region:IS:HIGHLANDS',
] as const;

/**
 * 粗算日照分钟（无天文库时的确定性近似；权威以气象服务为准）。
 * 公式：基于纬度与年积日的简化日光时长。
 */
export function estimateDaylightWindowMinutes(
  dateYmd: string,
  latitudeDeg: number = 64.15,
): {
  daylightMinutes: number;
  date: string;
  latitude: number;
  method: 'approx_solar_daylength';
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateYmd);
  const d = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : new Date();
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start) / 86400000);
  const lat = (latitudeDeg * Math.PI) / 180;
  const decl =
    0.4093 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const cosHa = Math.max(
    -1,
    Math.min(1, -Math.tan(lat) * Math.tan(decl)),
  );
  const ha = Math.acos(cosHa);
  const daylightHours = (2 * ha * 24) / (2 * Math.PI);
  return {
    daylightMinutes: Math.round(Math.max(0, Math.min(24, daylightHours)) * 60),
    date: dateYmd || d.toISOString().slice(0, 10),
    latitude: latitudeDeg,
    method: 'approx_solar_daylength',
  };
}

export async function loadWeatherForecastForRor(
  weather: RorWeatherPort | undefined,
  scope: ObservationScope,
  opts?: {
    cityHint?: string | null;
    destinationHint?: string | null;
    latitudeDeg?: number | null;
    longitudeDeg?: number | null;
  },
): Promise<unknown | null> {
  if (!weather?.getCurrentWeather) return null;
  if (weather.isServiceAvailable && !weather.isServiceAvailable()) return null;
  const geo = resolveWeatherGeoForRor({
    message: scope.message,
    destination: opts?.destinationHint,
    latitudeDeg: opts?.latitudeDeg,
    longitudeDeg: opts?.longitudeDeg,
  });
  const city = (opts?.cityHint || '').trim() || geo.city;
  try {
    const cur = await weather.getCurrentWeather(city);
    if (!cur) return null;
    return {
      city,
      provider: 'OPEN_METEO',
      observedAt: new Date().toISOString(),
      temperature_c: cur.temperature ?? (cur as any).temperature_2m,
      wind_speed: cur.wind_speed ?? (cur as any).wind_speed_10m,
      weather_code: cur.weather_code,
      humidity: cur.humidity ?? (cur as any).relative_humidity_2m,
      geoSource: (opts?.cityHint || '').trim() ? 'CITY_HINT' : geo.source,
      latitudeDeg: geo.latitudeDeg,
      longitudeDeg: geo.longitudeDeg,
      raw: cur,
    };
  } catch {
    return null;
  }
}

export async function loadRoadStatusForRor(
  road: RorRoadPort | undefined,
  scope: ObservationScope,
  ontologyNodeIds?: readonly string[],
): Promise<unknown | null> {
  if (!road?.summarizeForOntologyNodeIds) return null;
  const ids =
    ontologyNodeIds?.length
      ? ontologyNodeIds
      : inferRoadNodesFromMessage(scope.message);
  try {
    const map = await road.summarizeForOntologyNodeIds(ids);
    if (!map.size) return null;
    const regions = [...map.entries()].map(([id, payload]) => ({
      ontologyNodeId: id,
      aggregateAccessState: payload.aggregateAccessState,
      segments: payload.segments.map((s) => ({
        roadQueryKey: s.roadQueryKey,
        accessState: s.accessState,
        condition: s.condition,
        condition_text: s.condition_text,
      })),
    }));
    const worst = regions.reduce((acc, r) => {
      const order = ['OPEN', 'DIFFICULT', 'CLOSED', 'UNKNOWN'];
      const a = order.indexOf(String(acc));
      const b = order.indexOf(String(r.aggregateAccessState));
      return b > a ? r.aggregateAccessState : acc;
    }, 'OPEN' as string);
    return {
      provider: 'ONTOLOGY_ROAD_STATUS',
      observedAt: new Date().toISOString(),
      aggregateAccessState: worst,
      regions,
    };
  } catch {
    return null;
  }
}

export async function loadDaylightWindowForRor(
  scope: ObservationScope,
  dateYmd?: string | null,
  latitudeDeg?: number,
): Promise<unknown | null> {
  const date =
    (typeof dateYmd === 'string' && dateYmd) ||
    (typeof scope.planVersion === 'number' ? null : null) ||
    new Date().toISOString().slice(0, 10);
  const ymd = dateYmd || extractDateHint(scope.message) || date;
  return estimateDaylightWindowMinutes(ymd, latitudeDeg ?? 64.15);
}

function inferRoadNodesFromMessage(message?: string): string[] {
  const m = message ?? '';
  const nodes: string[] = [];
  if (/斯奈|Sn[æa]fell/i.test(m)) nodes.push('ontology:region:IS:SNAEFELLSNES');
  if (/南岸|South\s*Coast|维克|V[ií]k|冰川/i.test(m)) {
    nodes.push('ontology:region:IS:SOUTH_COAST');
  }
  if (/高地|Highland|F-?road|Þórsmörk|Thorsmork/i.test(m)) {
    nodes.push('ontology:region:IS:HIGHLANDS');
  }
  return nodes.length ? [...new Set(nodes)] : [...ROR_DEFAULT_IS_ROAD_ONTOLOGY_NODES];
}

function extractDateHint(message?: string): string | null {
  const m = (message ?? '').match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return m?.[1] ?? null;
}

/**
 * 组装 WEATHER / ROAD / ROUTE loaders（供 createObservationFetchHost）。
 */
export function buildWorldServiceRorLoaders(deps: {
  weather?: RorWeatherPort;
  road?: RorRoadPort;
  routes?: RorGoogleRoutesPort;
  cityHint?: string | null;
  destinationHint?: string | null;
  dateYmd?: string | null;
  latitudeDeg?: number | null;
  longitudeDeg?: number | null;
  routeLegs?: readonly RorRouteLegInput[] | null;
  travelMinutesHint?: number | null;
  travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
}): Partial<
  Record<
    'WEATHER' | 'ROAD' | 'ROUTE' | 'DERIVE',
    (contextKey: string, scope: ObservationScope) => Promise<unknown | null>
  >
> {
  const lat =
    deps.latitudeDeg ??
    resolveWeatherGeoForRor({
      destination: deps.destinationHint,
      latitudeDeg: deps.latitudeDeg,
      longitudeDeg: deps.longitudeDeg,
    }).latitudeDeg;

  return {
    WEATHER: async (contextKey, scope) => {
      if (contextKey === 'environment.daylightWindow') {
        return loadDaylightWindowForRor(scope, deps.dateYmd, lat ?? undefined);
      }
      if (
        contextKey === 'weather.forecast' ||
        contextKey === 'risk.trigger'
      ) {
        return loadWeatherForecastForRor(deps.weather, scope, {
          cityHint: deps.cityHint,
          destinationHint: deps.destinationHint,
          latitudeDeg: deps.latitudeDeg,
          longitudeDeg: deps.longitudeDeg,
        });
      }
      return null;
    },
    ROAD: async (contextKey, scope) => {
      if (
        contextKey === 'road.segment.status' ||
        contextKey === 'route.roadSegments'
      ) {
        return loadRoadStatusForRor(deps.road, scope);
      }
      return null;
    },
    ROUTE: async (contextKey, _scope) => {
      if (contextKey !== 'route.travelTimeMatrix') return null;
      return loadRouteTravelTimeMatrixForRor(
        deps.routes,
        deps.routeLegs ?? [],
        {
          travelMode: 'DRIVING',
          totalFallbackMinutes: deps.travelMinutesHint,
        },
      );
    },
    DERIVE: async (contextKey, scope) => {
      if (contextKey === 'environment.daylightWindow') {
        return loadDaylightWindowForRor(scope, deps.dateYmd, lat ?? undefined);
      }
      return null;
    },
  };
}
