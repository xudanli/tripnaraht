/** Single source of truth for Action PREVIEW/COMMIT physical gate (One-Version Policy). */
export const PHYSICAL_VALIDATOR_VERSION = 'v1-202605-stable';
export const PHYSICAL_RULE_BUNDLE_ID = 'ontology-spatial-v1';

/**
 * How the Action layer should react when PhysicalValidator reports violations.
 * Sprint 2 default: B-guarded — same POI set + overnight cities locked; intra-day reorder OK for SILENT_HEAL.
 */
export type ActionSeverity = 'SILENT_HEAL' | 'INTERRUPT';

/**
 * Stable machine codes on {@link PhysicalViolationItem.code} (emitted + planned).
 * Keep in sync with segment-feasibility.util, travel-ontology-constraints, and heal router.
 */
export const ViolationCode = {
  // --- B-guarded silent heal (solver may intra-day retime / re-route, lock POIs + nights) ---
  TIME_WINDOW_SLIGHT_SHIFT: 'TIME_WINDOW_SLIGHT_SHIFT',
  SEGMENT_RE_ROUTE: 'SEGMENT_RE_ROUTE',
  BUDGET_MINOR_DRIFT: 'BUDGET_MINOR_DRIFT',

  // --- Interrupt (explicit confirm / narrative); includes structural or safety stops ---
  SEGMENT_ROAD_CLOSED: 'SEGMENT_ROAD_CLOSED',
  POI_CLOSURE: 'POI_CLOSURE',
  NIGHT_CITY_MISMATCH: 'NIGHT_CITY_MISMATCH',
  CRITICAL_BUDGET_VIOLATION: 'CRITICAL_BUDGET_VIOLATION',

  // Spatial pipeline (segment-feasibility + PhysicalValidatorService)
  SEGMENT_SEASONALLY_CLOSED: 'SEGMENT_SEASONALLY_CLOSED',
  SEGMENT_REQUIRES_4X4: 'SEGMENT_REQUIRES_4X4',
  POI_CLOSED_AT_ETA: 'POI_CLOSED_AT_ETA',
  SEGMENT_INVALID_ENTER_AT: 'SEGMENT_INVALID_ENTER_AT',
  SEGMENT_NOT_FOUND: 'SEGMENT_NOT_FOUND',
  SEGMENT_EVAL_UNAVAILABLE: 'SEGMENT_EVAL_UNAVAILABLE',

  // Travel ontology constraints (`constraint` field → PhysicalViolationItem.code)
  TRAVEL_ONTOLOGY_BUDGET: 'travel_ontology_budget',
  TRAVEL_ONTOLOGY_FLIGHT_WINDOW: 'travel_ontology_flight_window',
  TRAVEL_ONTOLOGY_FLIGHT_OVERLAP: 'travel_ontology_flight_overlap',
  TRAVEL_ONTOLOGY_HOTEL_DATES: 'travel_ontology_hotel_dates',
} as const;

export type ViolationCode = (typeof ViolationCode)[keyof typeof ViolationCode];

/**
 * Static routing: which violations may be resolved inside preview/heal vs must surface to the user.
 * Degree-based splits (e.g. budget soft overrun %) are applied in handleViolation on top of this.
 */
export const VIOLATION_STRATEGY: Record<ViolationCode, ActionSeverity> = {
  [ViolationCode.TIME_WINDOW_SLIGHT_SHIFT]: 'SILENT_HEAL',
  [ViolationCode.SEGMENT_RE_ROUTE]: 'SILENT_HEAL',
  [ViolationCode.BUDGET_MINOR_DRIFT]: 'SILENT_HEAL',

  [ViolationCode.SEGMENT_ROAD_CLOSED]: 'INTERRUPT',
  [ViolationCode.POI_CLOSURE]: 'INTERRUPT',
  [ViolationCode.NIGHT_CITY_MISMATCH]: 'INTERRUPT',
  [ViolationCode.CRITICAL_BUDGET_VIOLATION]: 'INTERRUPT',

  [ViolationCode.SEGMENT_SEASONALLY_CLOSED]: 'INTERRUPT',
  [ViolationCode.SEGMENT_REQUIRES_4X4]: 'INTERRUPT',
  [ViolationCode.POI_CLOSED_AT_ETA]: 'INTERRUPT',
  [ViolationCode.SEGMENT_INVALID_ENTER_AT]: 'INTERRUPT',
  [ViolationCode.SEGMENT_NOT_FOUND]: 'INTERRUPT',
  [ViolationCode.SEGMENT_EVAL_UNAVAILABLE]: 'INTERRUPT',

  // Soft ontology budget cap: healable when overrun is small (router uses degree); treat as silent tier by default.
  [ViolationCode.TRAVEL_ONTOLOGY_BUDGET]: 'SILENT_HEAL',
  // Invalid / overlapping intervals need explicit fix or replan beyond B-guarded same-day tweak.
  [ViolationCode.TRAVEL_ONTOLOGY_FLIGHT_WINDOW]: 'INTERRUPT',
  [ViolationCode.TRAVEL_ONTOLOGY_FLIGHT_OVERLAP]: 'INTERRUPT',
  [ViolationCode.TRAVEL_ONTOLOGY_HOTEL_DATES]: 'INTERRUPT',
};

/** Safe lookup for arbitrary emitter strings (legacy / future codes). */
export function violationStrategyForCode(code: string | undefined): ActionSeverity {
  if (!code) return 'INTERRUPT';
  return VIOLATION_STRATEGY[code as ViolationCode] ?? 'INTERRUPT';
}
