/**
 * Golden fixtures for Shadow vs platform contrast harness.
 */

import { randomUUID } from 'crypto';
import type {
  InitialPlanVerificationSnapshot,
  VerificationTripContext,
} from '../types/iceland-initial-plan-verification.types';

function baseSnapshot(
  over: Omit<Partial<InitialPlanVerificationSnapshot>, 'tripContext'> & {
    tripContext?: Partial<VerificationTripContext>;
  } = {},
): InitialPlanVerificationSnapshot {
  const { tripContext: tripOver, ...rest } = over;
  return {
    verificationId: randomUUID(),
    tripId: 'contrast-trip',
    proposalId: randomUUID(),
    proposalVersion: 1,
    proposalHash: 'hash',
    contextHash: 'ctx',
    generatedBy: 'ICELAND_COVERAGE_DAY_ASSIGN',
    verificationMode: 'SHADOW',
    days: [],
    tripContext: {
      startDate: '2027-07-10',
      endDate: '2027-07-12',
      regionIds: ['south'],
      vehicleProfile: {
        is4wd: false,
        allowsFRoad: false,
        allowsRiverCrossing: false,
        vehicleClass: 'SEDAN',
      },
      dailyDrivingLimitMin: 360,
      ...tripOver,
    },
    unresolvedEntities: [],
    dayScopePackIds: [],
    writesPlanVersion: false,
    ...rest,
  };
}

/** Golden Circle–style coastal day: short drive, no F-road. Expect gateAligned. */
export function fixtureGoldenCirclePass(): {
  fixtureId: 'golden_circle';
  snapshot: InitialPlanVerificationSnapshot;
} {
  return {
    fixtureId: 'golden_circle',
    snapshot: baseSnapshot({
      tripId: 'contrast-golden-circle',
      tripContext: {
        regionIds: ['south'],
        vehicleProfile: {
          is4wd: false,
          allowsFRoad: false,
          allowsRiverCrossing: false,
          vehicleClass: 'SEDAN',
        },
      },
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          items: [
            {
              itemId: 'item_gullfoss',
              canonicalPlaceId: 100001,
              durationMin: 90,
              sourceEvidenceRefs: ['fixture:golden_circle'],
              packId: 'south',
              subregionId: 'golden_circle',
            },
            {
              itemId: 'item_geysir',
              canonicalPlaceId: 100002,
              durationMin: 60,
              sourceEvidenceRefs: ['fixture:golden_circle'],
              packId: 'south',
              subregionId: 'golden_circle',
            },
          ],
          totalDrivingMin: 120,
          totalActivityMin: 150,
          plannedBufferMin: 45,
          activatedDayScopeRules: [],
        },
      ],
    }),
  };
}

/** Highlands + 2WD on F-road place — both sides HARD on F-road/4WD. */
export function fixtureHighlandsFroad2wdBlock(): {
  fixtureId: 'highlands_froad_2wd';
  snapshot: InitialPlanVerificationSnapshot;
} {
  return {
    fixtureId: 'highlands_froad_2wd',
    snapshot: baseSnapshot({
      tripId: 'contrast-highlands-froad',
      tripContext: {
        regionIds: ['highlands'],
        vehicleProfile: {
          is4wd: false,
          allowsFRoad: false,
          allowsRiverCrossing: false,
          vehicleClass: 'SEDAN',
        },
      },
      dayScopePackIds: ['highlands'],
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          items: [
            {
              itemId: 'item_landmannalaugar',
              canonicalPlaceId: 381108,
              durationMin: 120,
              sourceEvidenceRefs: ['fixture:highlands_froad_2wd'],
              packId: 'highlands',
            },
          ],
          totalDrivingMin: 90,
          totalActivityMin: 120,
          plannedBufferMin: 30,
          activatedDayScopeRules: ['highlands'],
        },
      ],
    }),
  };
}

/**
 * Self-drive river ford without river-capable vehicle (injected roadRequirements).
 * Þórsmörk is no longer a self-drive attraction; fixture keeps CID mapping coverage.
 * Iceland EXECUTION_BLOCK; platform peer RIVER_CROSSING_SELF_DRIVE BLOCK → gateAligned.
 */
export function fixtureHighlandsRiverExecutionBlock(): {
  fixtureId: 'highlands_river';
  snapshot: InitialPlanVerificationSnapshot;
} {
  return {
    fixtureId: 'highlands_river',
    snapshot: baseSnapshot({
      tripId: 'contrast-highlands-river',
      tripContext: {
        regionIds: ['highlands'],
        vehicleProfile: {
          is4wd: true,
          allowsFRoad: true,
          allowsRiverCrossing: false,
          vehicleClass: 'SUV_4WD',
        },
      },
      dayScopePackIds: ['highlands'],
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          items: [
            {
              itemId: 'item_river_ford_self_drive',
              canonicalPlaceId: 381109,
              durationMin: 120,
              sourceEvidenceRefs: ['fixture:highlands_river'],
              packId: 'highlands',
              roadRequirements: {
                requiresFroad: true,
                requires4wd: true,
                riverCrossingRisk: true,
              },
            },
          ],
          totalDrivingMin: 100,
          totalActivityMin: 120,
          plannedBufferMin: 30,
          activatedDayScopeRules: ['highlands'],
        },
      ],
    }),
  };
}

/** Drive over daily cap — both sides HARD on MAX_DAILY_DRIVE. */
export function fixtureDriveCapBlock(): {
  fixtureId: 'drive_cap_block';
  snapshot: InitialPlanVerificationSnapshot;
} {
  return {
    fixtureId: 'drive_cap_block',
    snapshot: baseSnapshot({
      tripId: 'contrast-drive-cap',
      tripContext: {
        dailyDrivingLimitMin: 240,
        vehicleProfile: {
          is4wd: false,
          allowsFRoad: false,
          allowsRiverCrossing: false,
          vehicleClass: 'SEDAN',
        },
      },
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          items: [
            {
              itemId: 'item_far',
              canonicalPlaceId: 100003,
              durationMin: 60,
              sourceEvidenceRefs: ['fixture:drive_cap'],
            },
          ],
          totalDrivingMin: 400,
          totalActivityMin: 60,
          plannedBufferMin: 20,
          activatedDayScopeRules: [],
        },
      ],
    }),
  };
}
