/**
 * ONT-P2-04 — Frozen Cohort Registry (authorized total 24 trips / 42 users)
 */

import { createHash } from 'crypto';
import {
  COHORT_EXPANSION_TRIP_IDS,
  COHORT_EXPANSION_USER_IDS,
  COHORT_EXPANSION_PRIOR_TRIP_IDS,
  COHORT_EXPANSION_PRIOR_USER_IDS,
  COHORT_EXPANSION_NEW_TRIP_IDS,
  COHORT_EXPANSION_NEW_USER_IDS,
} from './cohort-expansion.cohort';
import {
  WAVE_3A_NEW_TRIP_IDS,
  WAVE_3A_NEW_USER_IDS,
  WAVE_3B_NEW_TRIP_IDS,
  WAVE_3B_NEW_USER_IDS,
  WAVE_3C_NEW_TRIP_IDS,
  WAVE_3C_NEW_USER_IDS,
} from './cohort-expansion.waves';
import { SELECTED_USER_CONSENT_VERSION } from './authorization';

export const P2_04_COHORT_REGISTRY_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_cohort_registry@v1' as const;

export const COHORT_REGISTRY_VERSION = 'p2-cohort-expansion@v1' as const;

export interface UserTripBinding {
  userId: string;
  tripId: string;
  consentVersion: typeof SELECTED_USER_CONSENT_VERSION;
  consentedAt: string;
  revokedAt: string | null;
  active: boolean;
  destination: 'IS';
  cohortSegment: 'PRIOR' | 'EXPANSION';
}

export interface FrozenCohortRegistry {
  schemaId: typeof P2_04_COHORT_REGISTRY_SCHEMA_ID;
  workItem: 'ONT-P2-04';
  cohortVersion: typeof COHORT_REGISTRY_VERSION;
  cohortHash: string;
  frozenAt: string;
  tripIds: string[];
  userIds: string[];
  userTripBindings: UserTripBinding[];
  consentVersion: typeof SELECTED_USER_CONSENT_VERSION;
  integrity: {
    validConsent: string;
    selectedTrips: string;
    missingBinding: number;
    duplicateBinding: number;
    priorTrips: number;
    priorUsers: number;
    expansionTrips: number;
    expansionUsers: number;
    authorizedTotalTrips: 24;
    authorizedTotalUsers: 42;
    note: '24/42 is authorized TOTAL scope after expansion, not additive delta';
  };
  pass: boolean;
}

function buildBindings(consentedAt: string): UserTripBinding[] {
  const bindings: UserTripBinding[] = [];

  // Prior: distribute 12 users across 7 trips
  const priorTrips = [...COHORT_EXPANSION_PRIOR_TRIP_IDS];
  for (let i = 0; i < COHORT_EXPANSION_PRIOR_USER_IDS.length; i++) {
    bindings.push({
      userId: COHORT_EXPANSION_PRIOR_USER_IDS[i]!,
      tripId: priorTrips[i % priorTrips.length]!,
      consentVersion: SELECTED_USER_CONSENT_VERSION,
      consentedAt,
      revokedAt: null,
      active: true,
      destination: 'IS',
      cohortSegment: 'PRIOR',
    });
  }

  // Expansion users bind within their activation wave trips (no cross-wave leak)
  const waveSlices: Array<{
    users: readonly string[];
    trips: readonly string[];
  }> = [
    { users: WAVE_3A_NEW_USER_IDS, trips: WAVE_3A_NEW_TRIP_IDS },
    { users: WAVE_3B_NEW_USER_IDS, trips: WAVE_3B_NEW_TRIP_IDS },
    { users: WAVE_3C_NEW_USER_IDS, trips: WAVE_3C_NEW_TRIP_IDS },
  ];
  for (const slice of waveSlices) {
    for (let i = 0; i < slice.users.length; i++) {
      bindings.push({
        userId: slice.users[i]!,
        tripId: slice.trips[i % slice.trips.length]!,
        consentVersion: SELECTED_USER_CONSENT_VERSION,
        consentedAt,
        revokedAt: null,
        active: true,
        destination: 'IS',
        cohortSegment: 'EXPANSION',
      });
    }
  }

  void COHORT_EXPANSION_NEW_TRIP_IDS;
  void COHORT_EXPANSION_NEW_USER_IDS;
  return bindings;
}

function computeCohortHash(input: {
  tripIds: readonly string[];
  userIds: readonly string[];
  userTripBindings: UserTripBinding[];
  consentVersion: string;
  cohortVersion: string;
}): string {
  return `ch_${createHash('sha256')
    .update(
      JSON.stringify({
        tripIds: input.tripIds,
        userIds: input.userIds,
        userTripBindings: input.userTripBindings.map((b) => ({
          userId: b.userId,
          tripId: b.tripId,
          consentVersion: b.consentVersion,
          consentedAt: b.consentedAt,
          revokedAt: b.revokedAt,
          active: b.active,
        })),
        consentVersion: input.consentVersion,
        cohortVersion: input.cohortVersion,
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;
}

export function freezeCohortRegistry(input?: {
  nowMs?: number;
  consentedAt?: string;
}): FrozenCohortRegistry {
  const frozenAt = new Date(input?.nowMs ?? Date.now()).toISOString();
  const consentedAt = input?.consentedAt ?? frozenAt;
  const tripIds = [...COHORT_EXPANSION_TRIP_IDS];
  const userIds = [...COHORT_EXPANSION_USER_IDS];
  const userTripBindings = buildBindings(consentedAt);

  const activeByUser = new Map<string, number>();
  const pairKeys = new Set<string>();
  let duplicateBinding = 0;
  for (const b of userTripBindings) {
    if (b.active && !b.revokedAt) {
      activeByUser.set(b.userId, (activeByUser.get(b.userId) ?? 0) + 1);
    }
    const pk = `${b.userId}::${b.tripId}`;
    if (pairKeys.has(pk)) duplicateBinding += 1;
    pairKeys.add(pk);
  }

  let missingBinding = 0;
  for (const u of userIds) {
    if ((activeByUser.get(u) ?? 0) < 1) missingBinding += 1;
  }

  const validConsentCount = userTripBindings.filter(
    (b) =>
      b.active &&
      !b.revokedAt &&
      b.consentVersion === SELECTED_USER_CONSENT_VERSION &&
      b.destination === 'IS',
  ).length;

  // One active binding per user expected
  const validConsent = `${Math.min(validConsentCount, userIds.length)}/${userIds.length}`;
  const selectedTrips = `${tripIds.length}/${tripIds.length}`;

  const cohortHash = computeCohortHash({
    tripIds,
    userIds,
    userTripBindings,
    consentVersion: SELECTED_USER_CONSENT_VERSION,
    cohortVersion: COHORT_REGISTRY_VERSION,
  });

  const pass =
    validConsent === '42/42' &&
    selectedTrips === '24/24' &&
    missingBinding === 0 &&
    duplicateBinding === 0 &&
    tripIds.length === 24 &&
    userIds.length === 42;

  return {
    schemaId: P2_04_COHORT_REGISTRY_SCHEMA_ID,
    workItem: 'ONT-P2-04',
    cohortVersion: COHORT_REGISTRY_VERSION,
    cohortHash,
    frozenAt,
    tripIds,
    userIds,
    userTripBindings,
    consentVersion: SELECTED_USER_CONSENT_VERSION,
    integrity: {
      validConsent,
      selectedTrips,
      missingBinding,
      duplicateBinding,
      priorTrips: COHORT_EXPANSION_PRIOR_TRIP_IDS.length,
      priorUsers: COHORT_EXPANSION_PRIOR_USER_IDS.length,
      expansionTrips: COHORT_EXPANSION_NEW_TRIP_IDS.length,
      expansionUsers: COHORT_EXPANSION_NEW_USER_IDS.length,
      authorizedTotalTrips: 24,
      authorizedTotalUsers: 42,
      note: '24/42 is authorized TOTAL scope after expansion, not additive delta',
    },
    pass,
  };
}
