/**
 * ONT-P2-04 — Expanded selected cohort (20–30 IS trips · 36–50 Opt-in users)
 * Diversity only; weather prediction frequency / thresholds / semantics unchanged.
 */

import {
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
} from './authorization';

/** Prior Wave1+2 selected trips (must remain included). */
export const COHORT_EXPANSION_PRIOR_TRIP_IDS = [
  ...SELECTED_USER_APPROVED_TRIP_IDS,
] as const;

/** Prior Wave1+2 Opt-in users (must remain included). */
export const COHORT_EXPANSION_PRIOR_USER_IDS = [
  ...SELECTED_USER_APPROVED_USER_IDS,
] as const;

/**
 * Newly added Iceland trips — regional / route diversity.
 * Does not change WEATHER_DETERIORATION prediction cadence or Canonical seals.
 */
export const COHORT_EXPANSION_NEW_TRIP_IDS = [
  'ont_p2_is_cohort_south_coast_06',
  'ont_p2_is_cohort_reykjanes_07',
  'ont_p2_is_cohort_snaefellsnes_08',
  'ont_p2_is_cohort_westfjords_09',
  'ont_p2_is_cohort_north_akureyri_10',
  'ont_p2_is_cohort_east_egilsstadir_11',
  'ont_p2_is_cohort_ring_selfoss_12',
  'ont_p2_is_cohort_highlands_kjolur_13',
  'ont_p2_is_cohort_highlands_sprengisandur_14',
  'ont_p2_is_cohort_froad_f208_15',
  'ont_p2_is_cohort_froad_f26_16',
  'ont_p2_is_cohort_vik_shoulder_17',
  'ont_p2_is_cohort_hofn_lagoon_18',
  'ont_p2_is_cohort_myvatn_19',
  'ont_p2_is_cohort_golden_circle_20',
  'ont_p2_is_cohort_borgarfjordur_21',
  'ont_p2_is_cohort_vatnajokull_approach_22',
] as const;

export const COHORT_EXPANSION_TRIP_IDS = [
  ...COHORT_EXPANSION_PRIOR_TRIP_IDS,
  ...COHORT_EXPANSION_NEW_TRIP_IDS,
] as const;

/** New Opt-in users — explicit consent still required (AND allowlist). */
export const COHORT_EXPANSION_NEW_USER_IDS = [
  'user_optin_is_13',
  'user_optin_is_14',
  'user_optin_is_15',
  'user_optin_is_16',
  'user_optin_is_17',
  'user_optin_is_18',
  'user_optin_is_19',
  'user_optin_is_20',
  'user_optin_is_21',
  'user_optin_is_22',
  'user_optin_is_23',
  'user_optin_is_24',
  'user_optin_is_25',
  'user_optin_is_26',
  'user_optin_is_27',
  'user_optin_is_28',
  'user_optin_is_29',
  'user_optin_is_30',
  'user_optin_is_31',
  'user_optin_is_32',
  'user_optin_is_33',
  'user_optin_is_34',
  'user_optin_is_35',
  'user_optin_is_36',
  'user_optin_is_37',
  'user_optin_is_38',
  'user_optin_is_39',
  'user_optin_is_40',
  'user_optin_is_41',
  'user_optin_is_42',
] as const;

export const COHORT_EXPANSION_USER_IDS = [
  ...COHORT_EXPANSION_PRIOR_USER_IDS,
  ...COHORT_EXPANSION_NEW_USER_IDS,
] as const;

export type CohortTripDiversityTag =
  | 'SOUTH_COAST'
  | 'REYKJANES'
  | 'SNAEFELLSNES'
  | 'WESTFJORDS'
  | 'NORTH'
  | 'EAST'
  | 'RING_ROAD'
  | 'HIGHLANDS'
  | 'F_ROAD'
  | 'GOLDEN_CIRCLE'
  | 'CANARY_WIND'
  | 'PILOT_LEGACY';

export interface CohortTripDiversityMeta {
  tripId: string;
  region: CohortTripDiversityTag;
  note: string;
}

export const COHORT_EXPANSION_TRIP_DIVERSITY: readonly CohortTripDiversityMeta[] = [
  { tripId: 'ont_p2_is_user_optin_weather_01', region: 'PILOT_LEGACY', note: 'Wave1/2 south-coast weather' },
  { tripId: 'ont_p2_is_user_optin_weather_02', region: 'PILOT_LEGACY', note: 'Wave1/2 weather' },
  { tripId: 'ont_p2_is_user_optin_weather_03', region: 'PILOT_LEGACY', note: 'Wave1/2 weather' },
  { tripId: 'ont_p2_is_user_optin_weather_04', region: 'PILOT_LEGACY', note: 'Wave1/2 weather' },
  { tripId: 'ont_p2_is_user_optin_weather_05', region: 'PILOT_LEGACY', note: 'Wave1/2 weather' },
  { tripId: 'ont_canary_is_wind_01', region: 'CANARY_WIND', note: 'Wind canary' },
  { tripId: 'ont_canary_is_wind_02', region: 'CANARY_WIND', note: 'Wind canary' },
  { tripId: 'ont_p2_is_cohort_south_coast_06', region: 'SOUTH_COAST', note: 'Vík–Mýrdalur corridor' },
  { tripId: 'ont_p2_is_cohort_reykjanes_07', region: 'REYKJANES', note: 'Reykjanes peninsula' },
  { tripId: 'ont_p2_is_cohort_snaefellsnes_08', region: 'SNAEFELLSNES', note: 'Snæfellsnes' },
  { tripId: 'ont_p2_is_cohort_westfjords_09', region: 'WESTFJORDS', note: 'Westfjords exposure' },
  { tripId: 'ont_p2_is_cohort_north_akureyri_10', region: 'NORTH', note: 'Akureyri / north ring' },
  { tripId: 'ont_p2_is_cohort_east_egilsstadir_11', region: 'EAST', note: 'East fjords approach' },
  { tripId: 'ont_p2_is_cohort_ring_selfoss_12', region: 'RING_ROAD', note: 'Selfoss ring segment' },
  { tripId: 'ont_p2_is_cohort_highlands_kjolur_13', region: 'HIGHLANDS', note: 'Kjölur seasonal' },
  { tripId: 'ont_p2_is_cohort_highlands_sprengisandur_14', region: 'HIGHLANDS', note: 'Sprengisandur seasonal' },
  { tripId: 'ont_p2_is_cohort_froad_f208_15', region: 'F_ROAD', note: 'F208 highland gate' },
  { tripId: 'ont_p2_is_cohort_froad_f26_16', region: 'F_ROAD', note: 'F26 highland gate' },
  { tripId: 'ont_p2_is_cohort_vik_shoulder_17', region: 'SOUTH_COAST', note: 'Vík shoulder season' },
  { tripId: 'ont_p2_is_cohort_hofn_lagoon_18', region: 'EAST', note: 'Höfn / lagoon corridor' },
  { tripId: 'ont_p2_is_cohort_myvatn_19', region: 'NORTH', note: 'Mývatn corridor' },
  { tripId: 'ont_p2_is_cohort_golden_circle_20', region: 'GOLDEN_CIRCLE', note: 'Golden Circle day loop' },
  { tripId: 'ont_p2_is_cohort_borgarfjordur_21', region: 'RING_ROAD', note: 'Borgarfjörður west' },
  { tripId: 'ont_p2_is_cohort_vatnajokull_approach_22', region: 'SOUTH_COAST', note: 'Vatnajökull approach' },
] as const;

export const COHORT_EXPANSION_TRIP_COUNT_MIN = 20;
export const COHORT_EXPANSION_TRIP_COUNT_MAX = 30;
export const COHORT_EXPANSION_USER_COUNT_MIN = 36;
export const COHORT_EXPANSION_USER_COUNT_MAX = 50;

export function assertCohortExpansionSizeInBand(input: {
  tripIds: readonly string[];
  userIds: readonly string[];
}): { ok: boolean; tripCount: number; userCount: number; reasons: string[] } {
  const tripCount = input.tripIds.length;
  const userCount = input.userIds.length;
  const reasons: string[] = [];
  if (tripCount < COHORT_EXPANSION_TRIP_COUNT_MIN || tripCount > COHORT_EXPANSION_TRIP_COUNT_MAX) {
    reasons.push(`tripCount ${tripCount} outside ${COHORT_EXPANSION_TRIP_COUNT_MIN}–${COHORT_EXPANSION_TRIP_COUNT_MAX}`);
  }
  if (userCount < COHORT_EXPANSION_USER_COUNT_MIN || userCount > COHORT_EXPANSION_USER_COUNT_MAX) {
    reasons.push(`userCount ${userCount} outside ${COHORT_EXPANSION_USER_COUNT_MIN}–${COHORT_EXPANSION_USER_COUNT_MAX}`);
  }
  return { ok: reasons.length === 0, tripCount, userCount, reasons };
}

export function isCohortExpansionProposedTrip(tripId: string): boolean {
  return (COHORT_EXPANSION_TRIP_IDS as readonly string[]).includes(tripId);
}

export function isCohortExpansionProposedUser(userId: string): boolean {
  return (COHORT_EXPANSION_USER_IDS as readonly string[]).includes(userId);
}
