/**
 * Frozen Production Canary weather source authority (2026-07-10).
 *
 * VEDUR_LIVE          — authoritative Iceland weather risk (create / upgrade / recover)
 * OPEN_METEO_FALLBACK — availability fallback (NO_ACTION, assist; cannot alone clear Vedur risk)
 * REAL_SHAPE_REPLAY   — canary / drill only; must not enter ordinary production trips
 */

export type WeatherEvidenceTier =
  | 'VEDUR_LIVE'
  | 'OPEN_METEO_FALLBACK'
  | 'REAL_SHAPE_REPLAY';

export type WeatherSourceProvider = 'iceland_met' | 'global_weather';

/** Vedur egress investigation timebox before architecture decision (hours). */
export const VEDUR_EGRESS_INVESTIGATION_HOURS = 72;

export function isRealShapeReplayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ICELAND_VEDUR_REPLAY_ENABLED?.trim();
  return v === '1' || v === 'true';
}

export function classifyWeatherEvidenceTier(input: {
  weatherSource?: string;
  sourceProvider?: WeatherSourceProvider;
  replay?: boolean;
}): WeatherEvidenceTier {
  if (input.replay || isRealShapeReplayEnabled()) {
    return 'REAL_SHAPE_REPLAY';
  }
  if (input.sourceProvider === 'iceland_met') {
    return 'VEDUR_LIVE';
  }
  const s = (input.weatherSource ?? '').toLowerCase();
  if (s.includes('vedur') || s.includes('iceland')) {
    return 'VEDUR_LIVE';
  }
  return 'OPEN_METEO_FALLBACK';
}
