/**
 * ONT-P2-04 — Wave 3A / 3B / 3C scopes within one approved Expansion Authorization
 * Totals are cumulative authorized coverage, not additive deltas on top of 24/42.
 */

import {
  COHORT_EXPANSION_NEW_TRIP_IDS,
  COHORT_EXPANSION_NEW_USER_IDS,
  COHORT_EXPANSION_PRIOR_TRIP_IDS,
  COHORT_EXPANSION_PRIOR_USER_IDS,
  COHORT_EXPANSION_TRIP_IDS,
  COHORT_EXPANSION_USER_IDS,
} from './cohort-expansion.cohort';

export type ExpansionWaveId = 'WAVE_3A' | 'WAVE_3B' | 'WAVE_3C';

/** Wave 3A delta: +5 trips / +10 users → cumulative ~12 / 22 */
export const WAVE_3A_NEW_TRIP_IDS = COHORT_EXPANSION_NEW_TRIP_IDS.slice(0, 5);
export const WAVE_3A_NEW_USER_IDS = COHORT_EXPANSION_NEW_USER_IDS.slice(0, 10);

/** Wave 3B delta: +6 trips / +10 users → cumulative ~18 / 32 */
export const WAVE_3B_NEW_TRIP_IDS = COHORT_EXPANSION_NEW_TRIP_IDS.slice(5, 11);
export const WAVE_3B_NEW_USER_IDS = COHORT_EXPANSION_NEW_USER_IDS.slice(10, 20);

/** Wave 3C delta: remaining → cumulative 24 / 42 */
export const WAVE_3C_NEW_TRIP_IDS = COHORT_EXPANSION_NEW_TRIP_IDS.slice(11);
export const WAVE_3C_NEW_USER_IDS = COHORT_EXPANSION_NEW_USER_IDS.slice(20);

export function waveCumulativeTripIds(wave: ExpansionWaveId): string[] {
  if (wave === 'WAVE_3A') {
    return [...COHORT_EXPANSION_PRIOR_TRIP_IDS, ...WAVE_3A_NEW_TRIP_IDS];
  }
  if (wave === 'WAVE_3B') {
    return [
      ...COHORT_EXPANSION_PRIOR_TRIP_IDS,
      ...WAVE_3A_NEW_TRIP_IDS,
      ...WAVE_3B_NEW_TRIP_IDS,
    ];
  }
  return [...COHORT_EXPANSION_TRIP_IDS];
}

export function waveCumulativeUserIds(wave: ExpansionWaveId): string[] {
  if (wave === 'WAVE_3A') {
    return [...COHORT_EXPANSION_PRIOR_USER_IDS, ...WAVE_3A_NEW_USER_IDS];
  }
  if (wave === 'WAVE_3B') {
    return [
      ...COHORT_EXPANSION_PRIOR_USER_IDS,
      ...WAVE_3A_NEW_USER_IDS,
      ...WAVE_3B_NEW_USER_IDS,
    ];
  }
  return [...COHORT_EXPANSION_USER_IDS];
}

export function waveDeltaTripIds(wave: ExpansionWaveId): string[] {
  if (wave === 'WAVE_3A') return [...WAVE_3A_NEW_TRIP_IDS];
  if (wave === 'WAVE_3B') return [...WAVE_3B_NEW_TRIP_IDS];
  return [...WAVE_3C_NEW_TRIP_IDS];
}

export function waveDeltaUserIds(wave: ExpansionWaveId): string[] {
  if (wave === 'WAVE_3A') return [...WAVE_3A_NEW_USER_IDS];
  if (wave === 'WAVE_3B') return [...WAVE_3B_NEW_USER_IDS];
  return [...WAVE_3C_NEW_USER_IDS];
}

export function describeWaveScope(wave: ExpansionWaveId): {
  wave: ExpansionWaveId;
  cumulativeTrips: number;
  cumulativeUsers: number;
  deltaTrips: number;
  deltaUsers: number;
  tripIds: string[];
  userIds: string[];
  deltaTripIds: string[];
  deltaUserIds: string[];
  note: string;
} {
  const tripIds = waveCumulativeTripIds(wave);
  const userIds = waveCumulativeUserIds(wave);
  const deltaTripIds = waveDeltaTripIds(wave);
  const deltaUserIds = waveDeltaUserIds(wave);
  return {
    wave,
    cumulativeTrips: tripIds.length,
    cumulativeUsers: userIds.length,
    deltaTrips: deltaTripIds.length,
    deltaUsers: deltaUserIds.length,
    tripIds,
    userIds,
    deltaTripIds,
    deltaUserIds,
    note:
      wave === 'WAVE_3A'
        ? 'Prior 7/12 + ~5 trips / ~10 users; consent/funnel/variant parity focus'
        : wave === 'WAVE_3B'
          ? 'Diversity + delivered→surfaced→opened leakage; deadline emphasis safety'
          : 'Full authorized total 24/42 only after 3A+3B zero red lights',
  };
}

/** Global emission idempotency — must NOT include cohortId, waveId, or variant. */
export function buildCrossCohortIdempotencyKey(input: {
  userId: string;
  tripId: string;
  predictionId: string;
  predictionVersion: string;
}): string {
  return [
    input.userId,
    input.tripId,
    input.predictionId,
    input.predictionVersion,
  ].join('|');
}
