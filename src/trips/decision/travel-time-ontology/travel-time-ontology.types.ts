/**
 * Travel Time Ontology v1 — replaces implicit fixed km/h with explicit provenance + factors (L1).
 *
 * Attach on {@link import('../world-model').TravelLeg.timeEstimate}; consumers treat
 * `pointEstimateMinutes` as aligned with `TravelLeg.durationMin` when both present.
 */

export const TRAVEL_TIME_ONTOLOGY_SCHEMA = 'tripnara/travel-time/v1' as const;

export type TravelTimeProvenance =
  /** Live routing provider (OSRM, SmartRoutes, Google, …) */
  | 'ROUTING_PROVIDER'
  /** Distance × implied speed model (see factors) */
  | 'HEURISTIC_SPEED_MODEL'
  /** Explicit legacy path — must narrow over time */
  | 'LEGACY_FIXED_KMH';

export type TravelSeasonHint = 'winter' | 'summer' | 'shoulder' | 'unknown';

export type TravelRoadNetworkClass = 'paved' | 'gravel' | 'f_road' | 'mixed' | 'unknown';

export type TravelWeatherBucket = 'clear' | 'adverse' | 'blocked_signal' | 'unknown';

export interface TravelTimeFactorBreakdownV1 {
  baseDistanceKm?: number;
  /** Effective km/h before multipliers (audit: “why this ETA”) */
  impliedAvgSpeedKmh?: number;
  seasonMultiplier?: number;
  weatherDelayMultiplier?: number;
  roadConditionMultiplier?: number;
  stopDensityMultiplier?: number;
  daylightPressureMultiplier?: number;
  fatigueMultiplier?: number;
}

export interface TravelTimeInputsResolvedV1 {
  season?: TravelSeasonHint;
  roadNetworkClass?: TravelRoadNetworkClass;
  weatherBucket?: TravelWeatherBucket;
  /** Mirrors hazard vehicle labels when relevant */
  vehicleClass?: string;
}

/**
 * Structured ETA envelope — SSOT-friendly: degraded flags surface dual-reality risk.
 */
export interface TravelTimeEstimateV1 {
  schema: typeof TRAVEL_TIME_ONTOLOGY_SCHEMA;
  /** Single-point ETA (minutes). Should match `TravelLeg.durationMin` when co-attached. */
  pointEstimateMinutes: number;
  /** Optional uncertainty band — filled when model produces distribution (future). */
  p10Minutes?: number;
  p90Minutes?: number;
  provenance: TravelTimeProvenance;
  /** Which dimensions were actually applied (honesty bit). */
  inputsResolved: TravelTimeInputsResolvedV1;
  factors: TravelTimeFactorBreakdownV1;
  /**
   * True when critical inputs defaulted (e.g. season/road unknown) — narrative layers should disclose.
   */
  degradedWorldModel?: boolean;
  /** Matches `TravelLeg.source` when helpful */
  legSourceHint?: string;
}

export function isTravelTimeEstimateV1(value: unknown): value is TravelTimeEstimateV1 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.schema === TRAVEL_TIME_ONTOLOGY_SCHEMA &&
    typeof o.pointEstimateMinutes === 'number' &&
    typeof o.provenance === 'string' &&
    typeof o.inputsResolved === 'object' &&
    o.inputsResolved != null &&
    typeof o.factors === 'object' &&
    o.factors != null
  );
}
