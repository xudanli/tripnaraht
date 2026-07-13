/**
 * P1 — Minimal Vedur circuit breaker configuration.
 */

export const DEFAULT_VEDUR_FAILURE_THRESHOLD = 3;
export const DEFAULT_VEDUR_CIRCUIT_OPEN_SECONDS = 300;
export const DEFAULT_VEDUR_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_VEDUR_MAX_BACKOFF_SECONDS = 900;

export type VedurCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export function resolveVedurFailureThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VEDUR_FAILURE_THRESHOLD?.trim();
  const n = raw ? Number(raw) : DEFAULT_VEDUR_FAILURE_THRESHOLD;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_VEDUR_FAILURE_THRESHOLD;
}

export function resolveVedurCircuitOpenSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VEDUR_CIRCUIT_OPEN_SECONDS?.trim();
  const n = raw ? Number(raw) : DEFAULT_VEDUR_CIRCUIT_OPEN_SECONDS;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_VEDUR_CIRCUIT_OPEN_SECONDS;
}

export function resolveVedurRequestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VEDUR_REQUEST_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_VEDUR_REQUEST_TIMEOUT_MS;
  return Number.isFinite(n) && n >= 1_000 ? Math.floor(n) : DEFAULT_VEDUR_REQUEST_TIMEOUT_MS;
}

export function resolveVedurMaxBackoffSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VEDUR_MAX_BACKOFF_SECONDS?.trim();
  const n = raw ? Number(raw) : DEFAULT_VEDUR_MAX_BACKOFF_SECONDS;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_VEDUR_MAX_BACKOFF_SECONDS;
}

export function isVedurCircuitBreakerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.VEDUR_CIRCUIT_BREAKER_ENABLED?.trim();
  if (v === '0' || v === 'false') return false;
  return true;
}
