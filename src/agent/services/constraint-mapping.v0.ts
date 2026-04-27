import { CONSTRAINT_IDS, type ConstraintId } from './constraint-registry';

export type ItineraryVerifyIssueType =
  | 'OPENING_HOURS_CONFLICT'
  | 'TRANSFER_BUFFER_INSUFFICIENT'
  | 'REACHABILITY_ISSUE'
  | 'FATIGUE_THRESHOLD_EXCEEDED'
  | 'TIME_WINDOW_OVERLAP';

export const ITINERARY_VERIFY_TYPE_TO_CONSTRAINT_ID: Record<ItineraryVerifyIssueType, ConstraintId> = {
  OPENING_HOURS_CONFLICT: CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP,
  TRANSFER_BUFFER_INSUFFICIENT: CONSTRAINT_IDS.TIME_SPACE_MIN_TRANSFER_BUFFER,
  REACHABILITY_ISSUE: CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY,
  TIME_WINDOW_OVERLAP: CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY,
  // NOTE: current itinerary.verify fatigue check is walking/activity-hours; mapping to max_driving_hours is a placeholder.
  FATIGUE_THRESHOLD_EXCEEDED: CONSTRAINT_IDS.TIME_SPACE_MAX_DRIVING_HOURS,
} as const;

export function constraintIdFromItineraryVerifyType(t: string | undefined): ConstraintId | undefined {
  if (!t) return undefined;
  return (ITINERARY_VERIFY_TYPE_TO_CONSTRAINT_ID as any)[t] as ConstraintId | undefined;
}

export type TerrainRiskFlagType = 'HIGH_ALTITUDE' | 'RAPID_ASCENT' | 'STEEP_SLOPE' | 'BIG_ASCENT_DAY';

export const TERRAIN_RISK_FLAG_TO_CONSTRAINT_ID: Partial<Record<TerrainRiskFlagType, ConstraintId>> = {
  STEEP_SLOPE: CONSTRAINT_IDS.TERRAIN_MAX_SLOPE_PCT,
  RAPID_ASCENT: CONSTRAINT_IDS.TERRAIN_MAX_DAILY_ASCENT_M,
  BIG_ASCENT_DAY: CONSTRAINT_IDS.TERRAIN_MAX_DAILY_ASCENT_M,
  // HIGH_ALTITUDE is currently advisory; keep unmapped for now (avoid forcing L3 without clear limit semantics).
} as const;

export function constraintIdFromTerrainRiskFlagType(t: string | undefined): ConstraintId | undefined {
  if (!t) return undefined;
  return (TERRAIN_RISK_FLAG_TO_CONSTRAINT_ID as any)[t] as ConstraintId | undefined;
}

