/**
 * RFC-001 Iceland vertical slice feature flags.
 * @deprecated Prefer rfc002-canonical.config.ts capability names (Phase 3).
 */

import {
  isAnyCanonicalSemanticCapabilityEnabled,
  isCanonicalExcessiveDailyLoadEnabled,
  isCanonicalExecutionScheduleInfeasibleEnabled,
  isCanonicalRoadSegmentUnavailableEnabled,
  isCanonicalWeatherActivityProhibitedEnabled,
} from './rfc002-canonical.config';

export function isRfc001IcelandRoadCloseEnabled(): boolean {
  return isCanonicalRoadSegmentUnavailableEnabled();
}

export function isRfc001IcelandWeatherActivityEnabled(): boolean {
  return isCanonicalWeatherActivityProhibitedEnabled();
}

export function isRfc001IcelandExcessiveDailyLoadEnabled(): boolean {
  return isCanonicalExcessiveDailyLoadEnabled();
}

export function isRfc001ExecutionSlipEnabled(): boolean {
  return isCanonicalExecutionScheduleInfeasibleEnabled();
}

export function isRfc001CanonicalSliceEnabled(): boolean {
  return isAnyCanonicalSemanticCapabilityEnabled();
}

export function isRfc001ShadowMode(): boolean {
  const v = process.env.RFC001_SHADOW_MODE;
  return v === '1' || v === 'true' || v === 'yes';
}

/** road.is cache TTL aligned with RoadStatusRealtimeService */
export const RFC001_ROAD_ASSERTION_VALIDITY_MS = 15 * 60 * 1000;

/** Weather hazard assertion TTL (shorter — conditions change faster) */
export const RFC001_WEATHER_ASSERTION_VALIDITY_MS = 60 * 60 * 1000;

/** L2 authorize → execute window before re-finalize is required */
export const RFC001_AUTHORIZATION_VALIDITY_MS = 24 * 60 * 60 * 1000;

export function isRfc001ItineraryMaterializeEnabled(): boolean {
  const v = process.env.RFC001_ITINERARY_MATERIALIZE;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Mirror RFC-001 ledger → trip.metadata.decisionSemantics (single projection writer) */
export function isRfc001V15ProjectionEnabled(): boolean {
  const v = process.env.RFC001_V15_PROJECTION;
  return v === '1' || v === 'true' || v === 'yes';
}

export const RFC001_EVIDENCE_RESOLVER_VERSION = 'evidence-resolver-0.1.0';
