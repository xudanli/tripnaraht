/**
 * RouteDirection Admin metadata contract (v1)
 *
 * Canonical storage keys (inside RouteDirection.metadata):
 * - segment_facts_v1
 * - environment_overrides_v1
 *
 * Consumed by:
 * - world.buildContext → PhysicalRealityModel.roadStates / prefetched_evidence
 * - research / gate-eval → solar + weatherRisk derivation
 */

/** Default admin provenance (matches historical frontend hardcode). */
export const ROUTE_DIRECTION_ADMIN_METADATA_SOURCE =
  'RouteDirection_Admin_Metadata' as const;

export const DEFAULT_SEGMENT_FACT_CONFIDENCE = 0.8;

export const ROAD_CONDITION_STATUSES = [
  'OPEN',
  'RESTRICTED',
  'CLOSED',
  'SEASONAL',
  'UNKNOWN',
] as const;

export type RoadConditionStatus = (typeof ROAD_CONDITION_STATUSES)[number];

/** Backend + research-pipeline aligned environment risk policy. */
export const DEFAULT_ENVIRONMENT_RISK_POLICY = {
  wind_drive_limit_kph: 50,
  min_visibility_m: 1000,
  precipitation_limit_mm: 10,
  snow_depth_limit_cm: 10,
  sunset_safety_buffer_min: 30,
} as const;

export const METADATA_KEY_SEGMENT_FACTS_V1 = 'segment_facts_v1' as const;
export const METADATA_KEY_ENVIRONMENT_OVERRIDES_V1 =
  'environment_overrides_v1' as const;

export type SegmentFactsMergeMode = 'replace' | 'upsert';
export type EnvironmentOverridesMergeMode = 'replace' | 'merge';
