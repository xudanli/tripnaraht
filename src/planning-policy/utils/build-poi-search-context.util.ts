import type { DecisionState, UserIntent } from '../../decision/kernel/decision-state.types';
import type { PoiSearchContext } from '../types/poi-search-context.types';

/** 与 `PhaseExecutorContext.tripPlanRequest` / `TripPlanRequest` 对齐的最小目的地类型 */
export type PoiSearchDestinationInput =
  | string
  | { lat: number; lng: number }
  | null
  | undefined;

function destinationToString(dest: PoiSearchDestinationInput): string {
  if (dest == null) return '';
  if (typeof dest === 'string') return dest.trim();
  return '';
}

/** 供 POI_SELECTION / RESEARCH 共用：从 itinerary-like 草案收集已选 place/poi id */
export function extractSelectedPlaceIdsFromItinerary(itinerary: unknown): string[] {
  if (!itinerary || typeof itinerary !== 'object') return [];
  const days = (itinerary as { days?: unknown[] }).days;
  if (!Array.isArray(days)) return [];
  const out: string[] = [];
  for (const d of days) {
    const items = (d as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const row = it as { type?: string; location_ref?: { place_id?: unknown } };
      if (String(row?.type ?? '').toUpperCase() !== 'POI') continue;
      const pid = row?.location_ref?.place_id;
      if (pid == null) continue;
      const s = String(pid).trim();
      if (s) out.push(s);
    }
  }
  return [...new Set(out.map((x) => x.toLowerCase()))];
}

function mapPaceToPacing(pace: UserIntent['pace']): PoiSearchContext['pacing'] | undefined {
  if (pace === 'relaxed') return 'relaxed';
  if (pace === 'dense') return 'intensive';
  if (pace === 'normal') return 'balanced';
  return undefined;
}

function normalizeFatigue(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (raw >= 0 && raw <= 1) return raw;
  if (raw > 1 && raw <= 100) return Math.min(1, raw / 100);
  return undefined;
}

function weatherFromEnvironment(
  env: DecisionState['environmentState'] | undefined,
): PoiSearchContext['weather'] | undefined {
  if (!env || typeof env !== 'object') return undefined;
  const risk = typeof env.weatherRisk === 'number' && Number.isFinite(env.weatherRisk) ? env.weatherRisk : undefined;
  const wind = typeof env.windSpeedMs === 'number' && Number.isFinite(env.windSpeedMs) ? env.windSpeedMs : undefined;
  if (risk == null && wind == null) return undefined;
  const parts: string[] = [];
  if (risk != null && risk > 0.55) parts.push('elevated_precip_risk');
  if (wind != null && wind > 12) parts.push('windy');
  if (!parts.length) return undefined;
  return { condition: parts.join(',') };
}

/**
 * 从 DSO + 行程草案 + 用户话术中组装 POI 检索上下文（不访问外部网络）。
 */
export function buildPoiSearchContext(params: {
  destination: PoiSearchDestinationInput;
  decisionState?: DecisionState;
  itinerary?: unknown;
  userMessage?: string;
}): PoiSearchContext {
  const dest = destinationToString(params.destination);
  const ui = params.decisionState?.userIntent;
  const tripState = params.decisionState?.tripState;
  const env = params.decisionState?.environmentState;

  const rejected = (ui?.excludePoiIds ?? [])
    .map((x) => String(x).trim().toLowerCase())
    .filter(Boolean);
  const selected = extractSelectedPlaceIdsFromItinerary(
    params.itinerary ?? tripState?.planDraft ?? params.decisionState?.tripState?.planDraft,
  );

  const prefs = ui?.preferences as Record<string, unknown> | undefined;
  let noveltyBias: number | undefined;
  const nRaw = prefs?.novelty ?? prefs?.novelty_bias ?? prefs?.exploration;
  if (typeof nRaw === 'number' && Number.isFinite(nRaw)) {
    noveltyBias = Math.max(0, Math.min(1, nRaw));
  }

  const pacing = mapPaceToPacing(ui?.pace);
  const fatigueScore = normalizeFatigue(tripState?.fatigue);
  const dayIndex =
    typeof tripState?.day === 'number' && Number.isFinite(tripState.day) ? Math.floor(tripState.day) : undefined;

  const tripStyle = [...(ui?.styleTags ?? [])].map((s) => String(s).trim()).filter(Boolean);

  return {
    destination: dest || 'destination',
    ...(tripStyle.length ? { tripStyle: tripStyle } : {}),
    ...(selected.length ? { selectedPoiIds: selected } : {}),
    ...(rejected.length ? { rejectedPoiIds: rejected } : {}),
    ...(dayIndex !== undefined ? { dayIndex } : {}),
    ...(fatigueScore !== undefined ? { fatigueScore } : {}),
    ...(noveltyBias !== undefined ? { noveltyBias } : {}),
    ...(weatherFromEnvironment(env) ? { weather: weatherFromEnvironment(env) } : {}),
    ...(pacing ? { pacing } : {}),
  };
}
