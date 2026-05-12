/**
 * Failure Ontology v1 — structured execution failures for Reality-Native Data Layer (L6).
 *
 * Stored conventionally under {@link OPS_REALITY_OUTCOME_EXTENSION_KEY} inside
 * `OpsRealityOutcomePayloadV1.extensions` so `OpsRealityAuditSnapshot.outcome` stays the SSOT row.
 */

export const FAILURE_ONTOLOGY_SCHEMA = 'tripnara/failure-ontology/v1' as const;

/**
 * Key inside `OpsRealityOutcomePayloadV1.extensions` for {@link FailureOntologyRecordV1}.
 */
export const OPS_REALITY_OUTCOME_EXTENSION_KEY = 'failure_ontology' as const;

/**
 * Iceland-first starter set — extend via migration / registry when promoting new codes.
 */
export type TripFailureType =
  | 'WHITEOUT_NIGHT_DRIVE'
  | 'MISSED_SUNSET'
  | 'NO_FUEL'
  | 'ROAD_CLOSED_EN_ROUTE'
  | 'WIND_HIGH_PROFILE_VEHICLE'
  | 'INSUFFICIENT_DAYLIGHT_ITINERARY'
  | 'F_ROAD_ACCESS_DENIED'
  | 'FORD_CROSSING_RISK'
  | 'OVERSTOP_DENSITY_COLLAPSE'
  | 'AURORA_CHASE_FATIGUE'
  | 'SNEAKER_WAVE_OR_COAST_HAZARD'
  | 'OTHER';

export const TRIP_FAILURE_TYPE_VALUES: readonly TripFailureType[] = [
  'WHITEOUT_NIGHT_DRIVE',
  'MISSED_SUNSET',
  'NO_FUEL',
  'ROAD_CLOSED_EN_ROUTE',
  'WIND_HIGH_PROFILE_VEHICLE',
  'INSUFFICIENT_DAYLIGHT_ITINERARY',
  'F_ROAD_ACCESS_DENIED',
  'FORD_CROSSING_RISK',
  'OVERSTOP_DENSITY_COLLAPSE',
  'AURORA_CHASE_FATIGUE',
  'SNEAKER_WAVE_OR_COAST_HAZARD',
  'OTHER',
] as const;

export function isTripFailureType(s: string): s is TripFailureType {
  return (TRIP_FAILURE_TYPE_VALUES as readonly string[]).includes(s);
}

/**
 * Normalized root-cause tags for analytics and retrieval (not free-form prose).
 */
export type FailureRootCause =
  | 'underestimated_wind'
  | 'late_departure'
  | 'insufficient_daylight'
  | 'winter_station_closed'
  | 'gravel_road_time'
  | 'excessive_stop_density'
  | 'mock_or_stale_weather'
  | 'inventory_snapshot_stale'
  | 'fixed_speed_model_bias'
  | 'ignored_blocked_execution_state'
  | 'other';

export const FAILURE_ROOT_CAUSE_VALUES: readonly FailureRootCause[] = [
  'underestimated_wind',
  'late_departure',
  'insufficient_daylight',
  'winter_station_closed',
  'gravel_road_time',
  'excessive_stop_density',
  'mock_or_stale_weather',
  'inventory_snapshot_stale',
  'fixed_speed_model_bias',
  'ignored_blocked_execution_state',
  'other',
] as const;

export function isFailureRootCause(s: string): s is FailureRootCause {
  return (FAILURE_ROOT_CAUSE_VALUES as readonly string[]).includes(s);
}

export type FailureObservedDomain =
  | 'weather'
  | 'road'
  | 'fuel'
  | 'time'
  | 'inventory'
  | 'human'
  | 'mixed';

export const FAILURE_OBSERVED_DOMAIN_VALUES: readonly FailureObservedDomain[] = [
  'weather',
  'road',
  'fuel',
  'time',
  'inventory',
  'human',
  'mixed',
] as const;

export function isFailureObservedDomain(s: string): s is FailureObservedDomain {
  return (FAILURE_OBSERVED_DOMAIN_VALUES as readonly string[]).includes(s);
}

/**
 * One logical failure episode attached to a single ops reality outcome row.
 */
export interface FailureOntologyRecordV1 {
  schema: typeof FAILURE_ONTOLOGY_SCHEMA;
  /** Primary label for ranking / dashboards */
  primary_failure_type: TripFailureType;
  /** Full multiset when multiple forces combined */
  contributing_failure_types?: TripFailureType[];
  root_causes: FailureRootCause[];
  /**
   * Stable recovery slugs (e.g. `overnight_near_hofn`) — operational playbook hooks.
   */
  recovery_patterns?: string[];
  observed_domain: FailureObservedDomain;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Optional link back to `ops_reality_audit_snapshots.id` when embedded elsewhere */
  linked_snapshot_id?: string;
  /** Free-form operator note; keep machine fields above canonical */
  narrative?: string;
}

export function isFailureOntologyRecordV1(value: unknown): value is FailureOntologyRecordV1 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.schema === FAILURE_ONTOLOGY_SCHEMA &&
    typeof o.primary_failure_type === 'string' &&
    Array.isArray(o.root_causes) &&
    typeof o.observed_domain === 'string' &&
    typeof o.severity === 'string'
  );
}
