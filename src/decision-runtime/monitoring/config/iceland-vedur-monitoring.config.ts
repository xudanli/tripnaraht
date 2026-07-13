/**
 * P1 — Live Vedur monitoring scheduler + anti-noise thresholds (Iceland canary only).
 */

export const ICELAND_VEDUR_MONITORING_SCHEMA_ID = 'tripnara.iceland_vedur_monitoring@v1';

export const RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY = 'rfc001VedurWeatherEvidence';

export const DEFAULT_VEDUR_WIND_DELTA_KMH = 5;

export const VEDUR_WEATHER_PROHIBITED_WIND_KMH = 90;

export const VEDUR_WEATHER_ELEVATED_WIND_KMH = VEDUR_WEATHER_PROHIBITED_WIND_KMH * 0.7;

export const DEFAULT_VEDUR_RECOVERY_CALM_POLLS = 2;

export function isIcelandVedurMonitoringEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ICELAND_VEDUR_MONITORING_ENABLED?.trim();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isIcelandVedurCanaryOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ICELAND_VEDUR_CANARY_ONLY?.trim();
  if (v === '0' || v === 'false') return false;
  return true;
}

export function resolveVedurWindDeltaKmh(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.ICELAND_VEDUR_WIND_DELTA_KMH?.trim();
  const n = raw ? Number(raw) : DEFAULT_VEDUR_WIND_DELTA_KMH;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_VEDUR_WIND_DELTA_KMH;
}

export function resolveVedurPollCron(env: NodeJS.ProcessEnv = process.env): string {
  return env.ICELAND_VEDUR_POLL_CRON?.trim() || '*/15 * * * *';
}

export function resolveVedurStagingWindThresholdKmh(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const raw = env.ICELAND_VEDUR_STAGING_WIND_THRESHOLD_KMH?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function resolveVedurRecoveryCalmPolls(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.ICELAND_VEDUR_RECOVERY_CALM_POLLS?.trim();
  const n = raw ? Number(raw) : DEFAULT_VEDUR_RECOVERY_CALM_POLLS;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_VEDUR_RECOVERY_CALM_POLLS;
}
