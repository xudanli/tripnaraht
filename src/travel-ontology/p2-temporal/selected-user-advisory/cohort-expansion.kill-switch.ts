/**
 * ONT-P2-04 — Independent expansion Kill Switch
 * When engaged: blocks NEW cohort trips/users only.
 * Prior validated 7 trips / 12 users continue under USER_ADVISORY kill switch.
 */

import {
  COHORT_EXPANSION_NEW_TRIP_IDS,
  COHORT_EXPANSION_NEW_USER_IDS,
} from './cohort-expansion.cohort';

export const COHORT_EXPANSION_KILL_SWITCH_ENV =
  'ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH' as const;

export function isOntologyP2CohortExpansionKillSwitchEngaged(): boolean {
  const v = process.env.ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isExpansionCohortTrip(tripId: string): boolean {
  return (COHORT_EXPANSION_NEW_TRIP_IDS as readonly string[]).includes(tripId);
}

export function isExpansionCohortUser(userId: string): boolean {
  return (COHORT_EXPANSION_NEW_USER_IDS as readonly string[]).includes(userId);
}

/** True if subject is part of the expansion delta (not prior 7/12). */
export function isExpansionCohortSubject(input: {
  tripId: string;
  userId: string;
}): boolean {
  return (
    isExpansionCohortTrip(input.tripId) || isExpansionCohortUser(input.userId)
  );
}

/**
 * Expansion emission gate: prior cohort ignores this switch;
 * expansion subjects are blocked while engaged.
 */
export function isExpansionEmissionBlocked(input: {
  tripId: string;
  userId: string;
}): boolean {
  if (!isExpansionCohortSubject(input)) return false;
  return isOntologyP2CohortExpansionKillSwitchEngaged();
}
