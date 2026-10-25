/**
 * Evidence precedence for Decision-time External Reality facts.
 *
 * Current authoritative observation
 *   > fresh realtime observation
 *   > forecast
 *   > seasonal prior
 *
 * Look must never outrank authority road facts.
 *
 * @see One decision, one consistent world.
 */

export type WeatherEvidenceBand =
  | 'AUTHORITY_OBSERVATION'
  | 'REALTIME_OBSERVATION'
  | 'FORECAST'
  | 'SEASONAL_PRIOR';

export const WEATHER_EVIDENCE_PRECEDENCE: readonly WeatherEvidenceBand[] = [
  'AUTHORITY_OBSERVATION',
  'REALTIME_OBSERVATION',
  'FORECAST',
  'SEASONAL_PRIOR',
] as const;

export type RoadEvidenceBand =
  | 'AUTHORITY_ROAD_FACT'
  | 'CONSTRAINT_STORE'
  | 'PHYSICAL_ROAD_STATES'
  | 'LOOK_NON_AUTHORITATIVE';

export const ROAD_EVIDENCE_PRECEDENCE: readonly RoadEvidenceBand[] = [
  'AUTHORITY_ROAD_FACT',
  'CONSTRAINT_STORE',
  'PHYSICAL_ROAD_STATES',
  'LOOK_NON_AUTHORITATIVE',
] as const;

export interface ResolvedDecisionWind {
  windSpeedMps: number;
  band: WeatherEvidenceBand;
  alertLevel?: string;
}

export function resolveDecisionWindSpeedMps(input: {
  weatherEvidenceWindMps?: number | null;
  seasonalTypicalWindMps?: number | null;
  authorityWindMps?: number | null;
  authorityAlertLevel?: string;
}): ResolvedDecisionWind | null {
  if (
    input.authorityWindMps != null &&
    Number.isFinite(input.authorityWindMps)
  ) {
    return {
      windSpeedMps: input.authorityWindMps,
      band: 'AUTHORITY_OBSERVATION',
      alertLevel: input.authorityAlertLevel,
    };
  }
  if (
    input.weatherEvidenceWindMps != null &&
    Number.isFinite(input.weatherEvidenceWindMps)
  ) {
    return {
      windSpeedMps: input.weatherEvidenceWindMps,
      band: 'REALTIME_OBSERVATION',
    };
  }
  if (
    input.seasonalTypicalWindMps != null &&
    Number.isFinite(input.seasonalTypicalWindMps)
  ) {
    return {
      windSpeedMps: input.seasonalTypicalWindMps,
      band: 'SEASONAL_PRIOR',
    };
  }
  return null;
}

export function peakWindFromWeatherEvidence(
  evidence:
    | Array<{ windSpeedMs?: number; windGustMs?: number }>
    | null
    | undefined,
): number | null {
  if (!evidence?.length) return null;
  let peak: number | null = null;
  for (const e of evidence) {
    const w = e.windGustMs ?? e.windSpeedMs;
    if (w == null || !Number.isFinite(w)) continue;
    peak = peak == null ? w : Math.max(peak, w);
  }
  return peak;
}

/** Resolve wind for CGUS / scoring from WorldModelContext.physical slice. */
export function resolveWindFromPhysicalReality(physical: {
  weatherEvidence?: Array<{ windSpeedMs?: number; windGustMs?: number }>;
  climateSeasonality?: { typicalWeather?: { windSpeedMps?: number } };
  /** Optional authority bind for this Decision Tick */
  authorityWindMps?: number | null;
  authorityAlertLevel?: string;
}): ResolvedDecisionWind | null {
  return resolveDecisionWindSpeedMps({
    authorityWindMps: physical.authorityWindMps,
    authorityAlertLevel: physical.authorityAlertLevel,
    weatherEvidenceWindMps: peakWindFromWeatherEvidence(physical.weatherEvidence),
    seasonalTypicalWindMps:
      physical.climateSeasonality?.typicalWeather?.windSpeedMps ?? null,
  });
}
