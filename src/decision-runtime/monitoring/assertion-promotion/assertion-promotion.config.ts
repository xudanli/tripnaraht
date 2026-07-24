/**
 * Assertion Auto-Promotion — feature flags (Monitoring layer).
 */

export const ASSERTION_PROMOTION_SCHEMA_ID = 'tripnara.assertion_promotion@v1';

/** Weather Canary — Phase 1 shadow scope only. */
export const DEFAULT_WEATHER_CANARY_TRIP_ID = 'a0a99999-9999-4999-8999-999999999999';

export type AssertionPromotionSignal = 'ASSERTION_EMITTED' | 'RECOVERY_OBSERVED';

export function isAssertionPromotionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ASSERTION_PROMOTION_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isAssertionPromotionShadowMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ASSERTION_PROMOTION_SHADOW_MODE?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

export function isAssertionPromotionWeatherEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ASSERTION_PROMOTION_WEATHER_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

export function isAssertionPromotionRoadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ASSERTION_PROMOTION_ROAD_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function parseAssertionPromotionTripAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw =
    env.ASSERTION_PROMOTION_TRIP_ALLOWLIST?.trim() || DEFAULT_WEATHER_CANARY_TRIP_ID;
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isTripEligibleForAssertionPromotion(
  tripId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isAssertionPromotionEnabled(env)) return false;
  return parseAssertionPromotionTripAllowlist(env).has(tripId);
}

export function resolveAssertionPromotionInternalSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const secret = env.ASSERTION_PROMOTION_INTERNAL_SECRET?.trim();
  return secret || undefined;
}

export function resolveAssertionPromotionBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.ASSERTION_PROMOTION_BASE_URL?.trim() || 'http://127.0.0.1:3002';
}

export function resolveAssertionPromotionRetryIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.ASSERTION_PROMOTION_RETRY_INTERVAL_MS?.trim();
  const n = raw ? Number(raw) : 300_000;
  return Number.isFinite(n) && n > 0 ? n : 300_000;
}

export function resolveAssertionPromotionMaxAttempts(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.ASSERTION_PROMOTION_MAX_ATTEMPTS?.trim();
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Drill-only: faster retry cron when test failpoint is active. */
export function resolveAssertionPromotionRetryCronExpression(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const v = env.ASSERTION_PROMOTION_TEST_FAIL_ONCE?.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') {
    return env.ASSERTION_PROMOTION_RETRY_CRON_EXPRESSION?.trim() || '*/20 * * * * *';
  }
  return '0 */5 * * * *';
}
