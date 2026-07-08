/**
 * World state data completeness — distinguishes "no data" from "no problems".
 * @see ADR-006-Unified-Decision-Runtime.md
 */

export type CompletenessLevel = 'COMPLETE' | 'PARTIAL' | 'MISSING';

export interface WorldStateCompleteness {
  roads: CompletenessLevel;
  weather: CompletenessLevel;
  hazards: CompletenessLevel;
  ferries: CompletenessLevel;
  openingHours: CompletenessLevel;
  /** CPRE — plan timeSlots use Travel Primary Key (is.*) */
  poiIdentity?: CompletenessLevel;
}

/** Explicit load marker on physical reality slices (Legacy defaults to NOT_LOADED). */
export type DataAvailabilityMarker = 'LOADED' | 'NOT_LOADED';

export interface WorldStateDataAvailability {
  roads?: DataAvailabilityMarker;
  weather?: DataAvailabilityMarker;
  hazards?: DataAvailabilityMarker;
  ferries?: DataAvailabilityMarker;
  openingHours?: DataAvailabilityMarker;
  poiIdentity?: DataAvailabilityMarker;
}
