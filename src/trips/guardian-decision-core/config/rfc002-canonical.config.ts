/**
 * RFC-002 Phase 3 — semantic capability feature flags (destination-agnostic names).
 * Legacy RFC001_ICELAND_* env vars remain supported as aliases.
 */

function readEnabledEnv(...keys: string[]): boolean {
  for (const key of keys) {
    const v = process.env[key];
    if (v === '1' || v === 'true' || v === 'yes') return true;
  }
  return false;
}

export function isCanonicalRoadSegmentUnavailableEnabled(): boolean {
  return readEnabledEnv(
    'CANONICAL_ROAD_SEGMENT_UNAVAILABLE',
    'RFC001_ICELAND_ROAD_CLOSE',
  );
}

export function isCanonicalWeatherActivityProhibitedEnabled(): boolean {
  return readEnabledEnv(
    'CANONICAL_WEATHER_ACTIVITY_PROHIBITED',
    'RFC001_ICELAND_WEATHER_ACTIVITY',
  );
}

export function isCanonicalExcessiveDailyLoadEnabled(): boolean {
  return readEnabledEnv(
    'CANONICAL_EXCESSIVE_DAILY_LOAD',
    'RFC001_ICELAND_EXCESSIVE_LOAD',
  );
}

export function isCanonicalExecutionScheduleInfeasibleEnabled(): boolean {
  return readEnabledEnv(
    'CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE',
    'RFC001_EXECUTION_SLIP',
  );
}

export function isAnyCanonicalSemanticCapabilityEnabled(): boolean {
  return (
    isCanonicalRoadSegmentUnavailableEnabled() ||
    isCanonicalWeatherActivityProhibitedEnabled() ||
    isCanonicalExcessiveDailyLoadEnabled() ||
    isCanonicalExecutionScheduleInfeasibleEnabled()
  );
}

/** Slice 4 — Shadow cluster runtime (read-only observation). Does NOT cut over visible queue. */
export function isAttentionOrchestrationShadowEnabled(): boolean {
  return readEnabledEnv('ATTENTION_ROOT_CAUSE_ORCHESTRATION');
}

/** Slice 4 — Primary Item becomes user-visible SSOT (blocked until Slice 3 CLOSED + shadow exit). */
export function isAttentionOrchestrationPrimarySsoEnabled(): boolean {
  return readEnabledEnv('ATTENTION_ROOT_CAUSE_PRIMARY_SSO');
}
