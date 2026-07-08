/**
 * Objective Semantics Registry — versioned objective definitions shared by all strategies.
 * @see ADR-007-Decision-Runtime-v2.md
 */

export type ObjectiveDirection = 'MAXIMIZE' | 'MINIMIZE';

export type ObjectiveMissingDataPolicy = 'FAIL' | 'IMPUTE' | 'IGNORE' | 'UNKNOWN';

/** Initial production set: 8 objectives (L2–L4) */
export type CanonicalObjectiveId =
  | 'daily_driving_load'
  | 'daily_physical_load'
  | 'time_window_satisfaction'
  | 'buffer_time'
  | 'must_visit_poi_completion'
  | 'interest_match'
  | 'min_member_utility'
  | 'total_travel_time'
  | 'budget_deviation';

export type ObjectiveTier = 'L2' | 'L3' | 'L4';

export interface ObjectiveSemantics {
  objectiveId: CanonicalObjectiveId;
  formulaVersion: string;
  evaluator: string;
  tier: ObjectiveTier;

  inputFields: string[];
  outputRange: [number, number];
  direction: ObjectiveDirection;
  missingDataPolicy: ObjectiveMissingDataPolicy;

  normalizationMethod: string;
  aggregationMethod: string;
  description?: string;
}

export interface ObjectiveEvaluation {
  objectiveId: CanonicalObjectiveId;
  formulaVersion: string;
  rawValue: number;
  normalizedValue: number;
  direction: ObjectiveDirection;
  missingData: boolean;
  evidenceRefs?: string[];
}

export interface ObjectiveProfile {
  /** Registry versions pinned for this Decision Run */
  registryVersion: string;
  enabledObjectives: CanonicalObjectiveId[];
  /** Weak-member protection: min(memberUtility) ≥ τ */
  minMemberUtilityThreshold?: number;
  weights?: Partial<Record<CanonicalObjectiveId, number>>;
}
