/**
 * Beta Trip Cohort — 真实完整旅行队列，作为 Closed Beta 证据面。
 */

import type { V1JourneyId } from './v1-journey-contract.util';

export const BETA_TRIP_COHORT_SCHEMA = 'nara.beta_trip_cohort@v1' as const;

export type BetaTripEnrollmentV1 = {
  tripId: string;
  enrolledAt: string;
  completeTrip: boolean;
  journeysTouched: V1JourneyId[];
  userWillingToContinue?: boolean;
};

export type BetaTripCohortV1 = {
  schemaId: typeof BETA_TRIP_COHORT_SCHEMA;
  version: 1;
  cohortId: string;
  trips: BetaTripEnrollmentV1[];
  architectureFreeze: true;
  minCompleteTripsForReleaseEvidence: number;
};

export function createBetaTripCohort(input?: {
  cohortId?: string;
  minCompleteTripsForReleaseEvidence?: number;
}): BetaTripCohortV1 {
  return {
    schemaId: BETA_TRIP_COHORT_SCHEMA,
    version: 1,
    cohortId: input?.cohortId ?? `cohort_${Date.now()}`,
    trips: [],
    architectureFreeze: true,
    minCompleteTripsForReleaseEvidence:
      input?.minCompleteTripsForReleaseEvidence ?? 3,
  };
}

export function enrollBetaTrip(
  cohort: BetaTripCohortV1,
  enrollment: Omit<BetaTripEnrollmentV1, 'enrolledAt'> & {
    enrolledAt?: string;
  },
): BetaTripCohortV1 {
  if (cohort.trips.some((t) => t.tripId === enrollment.tripId)) {
    return cohort;
  }
  return {
    ...cohort,
    trips: [
      ...cohort.trips,
      {
        tripId: enrollment.tripId,
        enrolledAt: enrollment.enrolledAt ?? new Date().toISOString(),
        completeTrip: enrollment.completeTrip,
        journeysTouched: [...enrollment.journeysTouched],
        userWillingToContinue: enrollment.userWillingToContinue,
      },
    ],
  };
}

export function countCompleteTrips(cohort: BetaTripCohortV1): number {
  return cohort.trips.filter((t) => t.completeTrip).length;
}
