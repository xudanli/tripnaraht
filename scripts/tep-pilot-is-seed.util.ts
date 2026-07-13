import { randomUUID } from 'crypto';
import type { ItemType, PrismaClient } from '@prisma/client';
import { loadIsCertScenariosFromFile } from '../src/trips/tep/certification/is-cert.harness';
import { loadIsCertRuntimeScenariosFromFile } from '../src/trips/tep/certification/is-cert-runtime.harness';
import { validateTepPlanningSnapshot } from '../src/trips/tep/validation/tep-validator';
import { projectDecisionHooks } from '../src/trips/tep/projectors/decision-hook.projector';
import { projectRecoveryGraph } from '../src/trips/tep/projectors/recovery-graph.projector';
import { buildTepPlanVersionMetadata } from '../src/trips/tep/contracts/tep-plan-metadata.types';
import type { RecoveryOption } from '../src/trips/tep/contracts/tep-self-drive.types';
import { toInputJsonValue } from '../src/trips/budget-os/utils/prisma-json.util';
import {
  PILOT_IS_01_DAY_ID,
  PILOT_IS_01_ITEM_START,
  PILOT_IS_01_ITEM_STOP,
  PILOT_IS_01_PLAN_VERSION_ID,
  PILOT_IS_01_TRIP_ID,
  PILOT_IS_02_DAY_ID,
  PILOT_IS_02_ITEM_GLACIER,
  PILOT_IS_02_ITEM_START,
  PILOT_IS_02_PLAN_VERSION_ID,
  PILOT_IS_02_ROAD_REF,
  PILOT_IS_02_TRIP_ID,
  PILOT_IS_03_DAY_ID,
  PILOT_IS_03_FALLBACK_POI,
  PILOT_IS_03_ITEM_COASTAL,
  PILOT_IS_03_ITEM_START,
  PILOT_IS_03_PLAN_VERSION_ID,
  PILOT_IS_03_TRIP_ID,
  PILOT_IS_04_DAY_ID,
  PILOT_IS_04_ITEM_START,
  PILOT_IS_04_ITEM_STOP,
  PILOT_IS_04_PLAN_VERSION_ID,
  PILOT_IS_04_TRIP_ID,
  PILOT_IS_05_DAY_ID,
  PILOT_IS_05_ITEM_HOTEL,
  PILOT_IS_05_ITEM_START,
  PILOT_IS_05_PLAN_VERSION_ID,
  PILOT_IS_05_TRIP_ID,
  PILOT_IS_06_DAY_ID,
  PILOT_IS_06_ITEM_START,
  PILOT_IS_06_ITEM_STOP,
  PILOT_IS_06_PLAN_VERSION_ID,
  PILOT_IS_06_TRIP_ID,
  PILOT_IS_07_DAY_ID,
  PILOT_IS_07_ITEM_END,
  PILOT_IS_07_ITEM_START,
  PILOT_IS_07_PLAN_VERSION_ID,
  PILOT_IS_07_ROAD_REF,
  PILOT_IS_07_TRIP_ID,
  PILOT_IS_08_DAY_ID,
  PILOT_IS_08_ITEM_END,
  PILOT_IS_08_ITEM_START,
  PILOT_IS_08_PLAN_VERSION_ID,
  PILOT_IS_08_ROAD_REF,
  PILOT_IS_08_TRIP_ID,
  PILOT_IS_09_DAY_ID,
  PILOT_IS_09_ITEM_APPOINTMENT,
  PILOT_IS_09_ITEM_START,
  PILOT_IS_09_PLAN_VERSION_ID,
  PILOT_IS_09_TRIP_ID,
  PILOT_IS_10_DAY_ID,
  PILOT_IS_10_ITEM_END,
  PILOT_IS_10_ITEM_START,
  PILOT_IS_10_PLAN_VERSION_ID,
  PILOT_IS_10_ROAD_REF,
  PILOT_IS_10_TRIP_ID,
  TEP_PILOT_TEMPLATE_TO_CERT,
  TEP_PILOT_USER_EMAIL,
  TEP_PILOT_USER_ID,
  type TepPilotTemplateId,
} from './tep-pilot-is-seed.constants';

export function buildTepMetadataFromCertScenario(
  scenarioId: string,
  tripId: string,
  planVersionId: string,
) {
  const scenarios = loadIsCertRuntimeScenariosFromFile();
  const scenario = scenarios.find((s) => s.scenarioId === scenarioId);
  if (!scenario) {
    throw new Error(`Cert scenario ${scenarioId} not found`);
  }

  const assessment = validateTepPlanningSnapshot({
    tripId,
    countryCode: scenario.input.countryCode,
    profile: scenario.input.profile,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId,
    countryCode: scenario.input.countryCode,
    profile: scenario.input.profile,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const hooks = projectDecisionHooks({
    tripId,
    countryCode: scenario.input.countryCode,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    profile: scenario.input.profile,
  });

  const now = new Date().toISOString();
  const pilotRuntimeHints =
    'previousObservation' in scenario.input || 'executionSlip' in scenario.input
      ? {
          certScenarioId: scenarioId,
          ...(scenario.input.previousObservation
            ? { previousObservation: scenario.input.previousObservation }
            : {}),
          ...(scenario.input.currentObservation
            ? { currentObservation: scenario.input.currentObservation }
            : {}),
          ...(scenario.input.executionSlip ? { executionSlip: scenario.input.executionSlip } : {}),
          ...(scenario.input.triggerEventId
            ? { triggerEventId: scenario.input.triggerEventId }
            : {}),
          ...(scenario.input.worldStateSnapshotId
            ? { worldStateSnapshotId: scenario.input.worldStateSnapshotId }
            : {}),
        }
      : undefined;

  return {
    recoveryGraph,
    hooks,
    assessmentStatus: assessment.status,
    metadata: {
      revision: 1,
      constraints: {
        maxDailyDrivingHours: 6,
        maxDailyDriveMinutes: 360,
        vehicle_type: '2WD',
        noNightDrive: { enabled: true, maxMinutesAfterSunset: 30 },
      },
      ...(pilotRuntimeHints ? { tepPilotRuntimeHints: pilotRuntimeHints } : {}),
      rfc001PlanVersions: {
        items: [
          {
            planVersionId,
            tripId,
            createdBy: 'PLANNER',
            operations: [],
            materializedPlanSnapshotRef: `snap_${planVersionId}`,
            status: 'EFFECTIVE',
            createdAt: now,
            effectiveAt: now,
            metadata: {
              tep: buildTepPlanVersionMetadata({
                decisionHooks: hooks,
                recoveryGraph,
                syncedAt: now,
              }),
            },
          },
        ],
        effectivePlanVersionId: planVersionId,
      },
    },
  };
}

/** Planning-period cert scenarios (tep-is-cert.scenarios.json) — e.g. IS-CERT-102 accommodation */
export function buildTepMetadataFromPlanningCertScenario(
  scenarioId: string,
  tripId: string,
  planVersionId: string,
) {
  const scenarios = loadIsCertScenariosFromFile();
  const scenario = scenarios.find((s) => s.scenarioId === scenarioId);
  if (!scenario) {
    throw new Error(`Planning cert scenario ${scenarioId} not found`);
  }

  const assessment = validateTepPlanningSnapshot({
    tripId,
    countryCode: scenario.input.countryCode,
    profile: scenario.input.profile,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    roadConditions: scenario.input.roadConditions,
    activityArrivals: scenario.input.activityArrivals,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId,
    countryCode: scenario.input.countryCode,
    profile: scenario.input.profile,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const hooks = projectDecisionHooks({
    tripId,
    countryCode: scenario.input.countryCode,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    profile: scenario.input.profile,
  });

  const now = new Date().toISOString();
  const pilotRuntimeHints = {
    certScenarioId: scenarioId,
    expected: scenario.expect,
    profile: scenario.input.profile,
    ...(scenario.input.activityArrivals
      ? { activityArrivals: scenario.input.activityArrivals }
      : {}),
    ...(scenario.input.roadConditions
      ? { roadConditions: scenario.input.roadConditions }
      : {}),
  };

  const vehicleType = scenario.input.profile.vehicle?.vehicleType ?? '2WD';
  const experience = scenario.input.profile.drivers?.[0]?.experienceLevel;

  return {
    recoveryGraph,
    hooks,
    assessmentStatus: assessment.status,
    metadata: {
      revision: 1,
      constraints: {
        maxDailyDrivingHours: 6,
        maxDailyDriveMinutes: 360,
        vehicle_type: vehicleType,
        noNightDrive: { enabled: true, maxMinutesAfterSunset: 30 },
      },
      ...(experience ? { driverExperienceLevel: experience } : {}),
      ...(scenario.input.profile.rentalRestrictions
        ? { rentalRestrictions: scenario.input.profile.rentalRestrictions }
        : {}),
      tepPilotRuntimeHints: pilotRuntimeHints,
      rfc001PlanVersions: {
        items: [
          {
            planVersionId,
            tripId,
            createdBy: 'PLANNER',
            operations: [],
            materializedPlanSnapshotRef: `snap_${planVersionId}`,
            status: 'EFFECTIVE',
            createdAt: now,
            effectiveAt: now,
            metadata: {
              tep: buildTepPlanVersionMetadata({
                decisionHooks: hooks,
                recoveryGraph,
                syncedAt: now,
              }),
            },
          },
        ],
        effectivePlanVersionId: planVersionId,
      },
    },
  };
}

function appendRecoveryOption(
  tepBundle: ReturnType<typeof buildTepMetadataFromCertScenario>,
  option: RecoveryOption,
): void {
  const recoveryGraph = {
    ...tepBundle.recoveryGraph,
    fallbackOptions: [...tepBundle.recoveryGraph.fallbackOptions, option],
  };
  tepBundle.recoveryGraph = recoveryGraph;

  const block = tepBundle.metadata.rfc001PlanVersions as {
    items: Array<{ metadata?: { tep?: ReturnType<typeof buildTepPlanVersionMetadata> } }>;
  };
  const tep = block.items[0]?.metadata?.tep;
  if (tep) {
    tep.recoveryGraph = recoveryGraph;
  }
}

export async function ensurePilotUser(prisma: PrismaClient, now: Date): Promise<void> {
  await prisma.user.upsert({
    where: { id: TEP_PILOT_USER_ID },
    create: {
      id: TEP_PILOT_USER_ID,
      email: TEP_PILOT_USER_EMAIL,
      emailVerified: true,
      displayName: 'TEP Pilot Internal',
      updatedAt: now,
    },
    update: {
      email: TEP_PILOT_USER_EMAIL,
      emailVerified: true,
      displayName: 'TEP Pilot Internal',
      updatedAt: now,
    },
  });
}

export async function cleanupPilotTrip(prisma: PrismaClient, tripId: string): Promise<void> {
  await prisma.tepRepairExecution.deleteMany({ where: { tripId } });
  await prisma.itineraryItem.deleteMany({ where: { TripDay: { tripId } } });
  await prisma.tripDay.deleteMany({ where: { tripId } });
  await prisma.tripCollaborator.deleteMany({ where: { tripId } });
  await prisma.trip.deleteMany({ where: { id: tripId } });
}

async function createPilotTripShell(input: {
  prisma: PrismaClient;
  tripId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  pacingConfig: Record<string, unknown>;
  tepBundle: ReturnType<typeof buildTepMetadataFromCertScenario>;
  now: Date;
}): Promise<void> {
  await input.prisma.trip.create({
    data: {
      id: input.tripId,
      destination: 'Iceland',
      startDate: input.startDate,
      endDate: input.endDate,
      updatedAt: input.now,
      status: 'PLANNING',
      name: input.name,
      pacingConfig: toInputJsonValue(input.pacingConfig),
      metadata: toInputJsonValue(input.tepBundle.metadata),
    },
  });

  await input.prisma.tripCollaborator.create({
    data: {
      id: randomUUID(),
      tripId: input.tripId,
      userId: TEP_PILOT_USER_ID,
      role: 'OWNER',
      updatedAt: input.now,
    },
  });
}

export async function seedPilotTemplate(
  prisma: PrismaClient,
  template: Exclude<TepPilotTemplateId, 'all' | '302' | 'planning-all'>,
): Promise<Record<string, unknown>> {
  const certScenarioId = TEP_PILOT_TEMPLATE_TO_CERT[template];

  switch (template) {
    case '01':
      return seedPilotIs01(prisma, new Date(), certScenarioId);
    case '02':
      return seedPilotIs02(prisma, new Date(), certScenarioId);
    case '03':
      return seedPilotIs03(prisma, new Date(), certScenarioId);
    case '04':
      return seedPilotIs04(prisma, new Date(), certScenarioId);
    case '05':
      return seedPilotIs05(prisma, new Date(), certScenarioId);
    case '06':
      return seedPilotIs06(prisma, new Date(), certScenarioId);
    case '07':
      return seedPilotIs07(prisma, new Date(), certScenarioId);
    case '08':
      return seedPilotIs08(prisma, new Date(), certScenarioId);
    case '09':
      return seedPilotIs09(prisma, new Date(), certScenarioId);
    case '10':
      return seedPilotIs10(prisma, new Date(), certScenarioId);
    default: {
      const _exhaustive: never = template;
      throw new Error(`Unsupported template ${String(_exhaustive)}`);
    }
  }
}

async function seedPilotIs01(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_01_TRIP_ID;
  const planVersionId = PILOT_IS_01_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-05T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromCertScenario(certScenarioId, tripId, planVersionId);
  tepBundle.metadata = {
    ...tepBundle.metadata,
    driverExperienceLevel: 'EXPERIENCED',
    constraints: {
      ...tepBundle.metadata.constraints,
      vehicle_type: '4WD',
      noNightDrive: { enabled: false },
    },
  };

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-01 南岸高负荷 (SDR-101)',
    startDate: dayDate,
    endDate: new Date('2026-08-10T00:00:00.000Z'),
    pacingConfig: {
      travelMode: 'DRIVING',
      level: 'normal',
      maxDailyDriveMinutes: 360,
      vehicleType: '4WD',
    },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_01_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_01_ITEM_START,
      tripDayId: PILOT_IS_01_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({
        tepImportance: 'RECOMMENDED',
        tepFlexibility: 'MOVABLE',
        durationMinutes: 0,
      }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_01_ITEM_STOP,
      tripDayId: PILOT_IS_01_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'OPTIONAL',
        tepFlexibility: 'REMOVABLE',
        durationMinutes: 30,
      }),
      travelFromPreviousDuration: 330,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '01',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_01_ITEM_START, PILOT_IS_01_ITEM_STOP],
  });
}

async function seedPilotIs02(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_02_TRIP_ID;
  const planVersionId = PILOT_IS_02_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-09T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromCertScenario(certScenarioId, tripId, planVersionId);

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-02 道路关闭 (SDR-002 / F208)',
    startDate: dayDate,
    endDate: new Date('2026-08-16T00:00:00.000Z'),
    pacingConfig: { travelMode: 'DRIVING', level: 'normal', maxDailyDriveMinutes: 360 },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_02_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_02_ITEM_START,
      tripDayId: PILOT_IS_02_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'RECOMMENDED', tepFlexibility: 'MOVABLE' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_02_ITEM_GLACIER,
      tripDayId: PILOT_IS_02_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      startTime: new Date('2026-08-09T10:00:00.000Z'),
      note: JSON.stringify({
        tepImportance: 'MANDATORY',
        tepFlexibility: 'FIXED',
        weatherSensitive: true,
        routeSegmentId: PILOT_IS_02_ROAD_REF,
        durationMinutes: 180,
        bufferMinutes: 30,
      }),
      travelFromPreviousDuration: 90,
      travelMode: 'DRIVING',
      bookingStatus: 'CONFIRMED',
    },
  });

  return buildSeedResult({
    template: '02',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_02_ITEM_START, PILOT_IS_02_ITEM_GLACIER],
    runtimeNote: `Inject worldState road.status CLOSED on ${PILOT_IS_02_ROAD_REF} to trigger IS-CERT-301`,
  });
}

async function seedPilotIs03(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_03_TRIP_ID;
  const planVersionId = PILOT_IS_03_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-10T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromCertScenario(certScenarioId, tripId, planVersionId);

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-03 海岸步行 REPLACE (SDR-302)',
    startDate: dayDate,
    endDate: new Date('2026-08-15T00:00:00.000Z'),
    pacingConfig: { travelMode: 'DRIVING', level: 'normal', maxDailyDriveMinutes: 360 },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_03_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_03_ITEM_START,
      tripDayId: PILOT_IS_03_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'RECOMMENDED', tepFlexibility: 'MOVABLE' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_03_ITEM_COASTAL,
      tripDayId: PILOT_IS_03_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'RECOMMENDED',
        tepFlexibility: 'REPLACEABLE',
        weatherSensitive: true,
        durationMinutes: 90,
        bufferMinutes: 15,
        weatherFallbackRef: 'activity_indoor_museum_fallback',
        weatherFallbackPoiId: PILOT_IS_03_FALLBACK_POI,
      }),
      travelFromPreviousDuration: 60,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '03',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_03_ITEM_START, PILOT_IS_03_ITEM_COASTAL],
    runtimeNote: 'Inject weather.windSpeedKmh ≥ 95 to trigger IS-CERT-303 REPLACE',
  });
}

async function seedPilotIs04(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_04_TRIP_ID;
  const planVersionId = PILOT_IS_04_PLAN_VERSION_ID;
  const dayDate = new Date('2026-01-15T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromCertScenario(certScenarioId, tripId, planVersionId);
  tepBundle.metadata = {
    ...tepBundle.metadata,
    driverExperienceLevel: 'INTERMEDIATE',
    constraints: {
      ...tepBundle.metadata.constraints,
      vehicle_type: '4WD',
      noNightDrive: { enabled: true },
    },
  };
  const hints = tepBundle.metadata.tepPilotRuntimeHints as
    | { executionSlip?: Record<string, unknown> }
    | undefined;
  if (hints?.executionSlip) {
    hints.executionSlip = {
      ...hints.executionSlip,
      currentActivityId: PILOT_IS_04_ITEM_START,
      nextActivityId: PILOT_IS_04_ITEM_STOP,
    };
  }
  appendRecoveryOption(tepBundle, {
    optionId: 'REPAIR-SDR202-D1-activity_stop_405',
    triggerRuleId: 'SDR-202',
    action: 'REMOVE',
    targetRefs: ['activity_stop_405', 'day_1'],
    description: '删除可选停靠以回收日照窗口（执行 slip 后）',
  });

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-04 冬季 slip→日照 (SDR-202)',
    startDate: dayDate,
    endDate: new Date('2026-01-19T00:00:00.000Z'),
    pacingConfig: {
      travelMode: 'DRIVING',
      level: 'normal',
      maxDailyDriveMinutes: 360,
      noNightDrive: true,
    },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_04_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_04_ITEM_START,
      tripDayId: PILOT_IS_04_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({
        tepImportance: 'MANDATORY',
        tepFlexibility: 'FIXED',
        durationMinutes: 0,
      }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_04_ITEM_STOP,
      tripDayId: PILOT_IS_04_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'OPTIONAL',
        tepFlexibility: 'REMOVABLE',
        durationMinutes: 30,
      }),
      travelFromPreviousDuration: 520,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '04',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_04_ITEM_START, PILOT_IS_04_ITEM_STOP],
    runtimeNote: 'Inject executionSlip 90min (see metadata.tepPilotRuntimeHints) to trigger IS-CERT-405',
  });
}

async function seedPilotIs05(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_05_TRIP_ID;
  const planVersionId = PILOT_IS_05_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-06T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromPlanningCertScenario(certScenarioId, tripId, planVersionId);
  const dayIso = dayDate.toISOString();
  const baseHints = tepBundle.metadata.tepPilotRuntimeHints as Record<string, unknown> | undefined;
  tepBundle.metadata = {
    ...tepBundle.metadata,
    tepPilotRuntimeHints: {
      ...baseHints,
      certScenarioId,
      expected: { status: 'REQUIRES_CONFIRMATION', ruleIds: ['SDR-201'], outcomes: ['NEED_CONFIRM'] },
      activityArrivals: [
        {
          activityRef: `accommodation_${PILOT_IS_05_ITEM_HOTEL}`,
          projectedArrivalAt: `${dayIso.slice(0, 10)}T22:15:00.000Z`,
        },
      ],
    },
  };

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-05 住宿可达 (SDR-201/203)',
    startDate: dayDate,
    endDate: new Date('2026-08-12T00:00:00.000Z'),
    pacingConfig: {
      travelMode: 'DRIVING',
      level: 'normal',
      maxDailyDriveMinutes: 360,
      noNightDrive: true,
    },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_05_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_05_ITEM_START,
      tripDayId: PILOT_IS_05_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'RECOMMENDED', tepFlexibility: 'MOVABLE' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_05_ITEM_HOTEL,
      tripDayId: PILOT_IS_05_DAY_ID,
      type: 'REST' as ItemType,
      order: 2,
      costCategory: 'ACCOMMODATION',
      note: JSON.stringify({
        latestArrival: '22:00',
        tepImportance: 'MANDATORY',
        tepFlexibility: 'FIXED',
      }),
      travelFromPreviousDuration: 45,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '05',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_05_ITEM_START, PILOT_IS_05_ITEM_HOTEL],
    runtimeNote:
      'Planning smoke uses activityArrivals in metadata.tepPilotRuntimeHints (IS-CERT-102 → SDR-201 NEED_CONFIRM)',
  });
}

async function seedPilotIs06(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_06_TRIP_ID;
  const planVersionId = PILOT_IS_06_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-05T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromCertScenario(certScenarioId, tripId, planVersionId);
  tepBundle.metadata = {
    ...tepBundle.metadata,
    driverExperienceLevel: 'EXPERIENCED',
    constraints: {
      ...tepBundle.metadata.constraints,
      vehicle_type: '4WD',
      noNightDrive: { enabled: false },
    },
  };

  tepBundle.recoveryGraph = {
    ...tepBundle.recoveryGraph,
    fallbackOptions: tepBundle.recoveryGraph.fallbackOptions.map((option) => ({
      ...option,
      optionId: option.optionId.replace('activity_stop_1', 'activity_stop_6'),
      targetRefs: option.targetRefs.map((ref) =>
        ref === 'activity_stop_1' ? 'activity_stop_6' : ref,
      ),
    })),
  };
  const block = tepBundle.metadata.rfc001PlanVersions as {
    items: Array<{ metadata?: { tep?: { recoveryGraph?: typeof tepBundle.recoveryGraph } } }>;
  };
  const tepMeta = block.items[0]?.metadata?.tep;
  if (tepMeta) {
    tepMeta.recoveryGraph = tepBundle.recoveryGraph;
  }

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-06 并发 accept 压测 (IS-CERT-401-CONCURRENT)',
    startDate: dayDate,
    endDate: new Date('2026-08-10T00:00:00.000Z'),
    pacingConfig: {
      travelMode: 'DRIVING',
      level: 'normal',
      maxDailyDriveMinutes: 360,
      vehicleType: '4WD',
    },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_06_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_06_ITEM_START,
      tripDayId: PILOT_IS_06_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({
        tepImportance: 'RECOMMENDED',
        tepFlexibility: 'MOVABLE',
        durationMinutes: 0,
      }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_06_ITEM_STOP,
      tripDayId: PILOT_IS_06_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'OPTIONAL',
        tepFlexibility: 'REMOVABLE',
        durationMinutes: 30,
      }),
      travelFromPreviousDuration: 330,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '06',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_06_ITEM_START, PILOT_IS_06_ITEM_STOP],
    runtimeNote: 'Run npm run tep:pilot-concurrent-smoke after seed (dual accept → single PlanVersion)',
  });
}

async function seedPilotIs07(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_07_TRIP_ID;
  const planVersionId = PILOT_IS_07_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-02T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromPlanningCertScenario(certScenarioId, tripId, planVersionId);

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-07 2WD+F208 高地 (SDR-001)',
    startDate: dayDate,
    endDate: new Date('2026-08-07T00:00:00.000Z'),
    pacingConfig: { travelMode: 'DRIVING', level: 'normal', vehicleType: '2WD' },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_07_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_07_ITEM_START,
      tripDayId: PILOT_IS_07_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'RECOMMENDED', tepFlexibility: 'MOVABLE' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_07_ITEM_END,
      tripDayId: PILOT_IS_07_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'RECOMMENDED',
        tepFlexibility: 'REMOVABLE',
        routeSegmentId: PILOT_IS_07_ROAD_REF,
      }),
      travelFromPreviousDuration: 120,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '07',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_07_ITEM_START, PILOT_IS_07_ITEM_END],
    runtimeNote: 'npm run tep:pilot-planning-smoke -- --template=07',
  });
}

async function seedPilotIs08(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_08_TRIP_ID;
  const planVersionId = PILOT_IS_08_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-02T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromPlanningCertScenario(certScenarioId, tripId, planVersionId);

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-08 租车禁 F-road (SDR-003)',
    startDate: dayDate,
    endDate: new Date('2026-08-07T00:00:00.000Z'),
    pacingConfig: { travelMode: 'DRIVING', level: 'normal', vehicleType: '4WD' },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_08_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_08_ITEM_START,
      tripDayId: PILOT_IS_08_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'MANDATORY', tepFlexibility: 'FIXED' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_08_ITEM_END,
      tripDayId: PILOT_IS_08_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'MANDATORY',
        tepFlexibility: 'FIXED',
        routeSegmentId: PILOT_IS_08_ROAD_REF,
      }),
      travelFromPreviousDuration: 120,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '08',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_08_ITEM_START, PILOT_IS_08_ITEM_END],
    runtimeNote: 'npm run tep:pilot-planning-smoke -- --template=08',
  });
}

async function seedPilotIs09(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_09_TRIP_ID;
  const planVersionId = PILOT_IS_09_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-04T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromPlanningCertScenario(certScenarioId, tripId, planVersionId);
  const dayIso = dayDate.toISOString().slice(0, 10);
  tepBundle.metadata = {
    ...tepBundle.metadata,
    tepPilotRuntimeHints: {
      certScenarioId,
      expected: { status: 'NOT_EXECUTABLE', ruleIds: ['SDR-203'], outcomes: ['REJECT'] },
      activityArrivals: [
        {
          activityRef: `activity_${PILOT_IS_09_ITEM_APPOINTMENT}`,
          projectedArrivalAt: `${dayIso}T17:00:00.000Z`,
        },
      ],
    },
  };

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-09 预约赶不上 (SDR-203)',
    startDate: dayDate,
    endDate: new Date('2026-08-09T00:00:00.000Z'),
    pacingConfig: { travelMode: 'DRIVING', level: 'normal', maxDailyDriveMinutes: 360 },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_09_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_09_ITEM_START,
      tripDayId: PILOT_IS_09_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'RECOMMENDED', tepFlexibility: 'MOVABLE' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_09_ITEM_APPOINTMENT,
      tripDayId: PILOT_IS_09_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      startTime: new Date(`${dayIso}T16:00:00.000Z`),
      note: JSON.stringify({
        tepImportance: 'MANDATORY',
        tepFlexibility: 'FIXED',
        reservationRequired: true,
        durationMinutes: 90,
        fixedStartAt: `${dayIso}T16:00:00.000Z`,
      }),
      travelFromPreviousDuration: 60,
      travelMode: 'DRIVING',
      bookingStatus: 'CONFIRMED',
    },
  });

  return buildSeedResult({
    template: '09',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_09_ITEM_START, PILOT_IS_09_ITEM_APPOINTMENT],
    runtimeNote: 'npm run tep:pilot-planning-smoke -- --template=09',
  });
}

async function seedPilotIs10(
  prisma: PrismaClient,
  now: Date,
  certScenarioId: string,
): Promise<Record<string, unknown>> {
  const tripId = PILOT_IS_10_TRIP_ID;
  const planVersionId = PILOT_IS_10_PLAN_VERSION_ID;
  const dayDate = new Date('2026-08-07T00:00:00.000Z');
  const tepBundle = buildTepMetadataFromPlanningCertScenario(certScenarioId, tripId, planVersionId);

  await createPilotTripShell({
    prisma,
    tripId,
    name: 'PILOT-IS-10 道路证据过期 (SDR-002 UNKNOWN)',
    startDate: dayDate,
    endDate: new Date('2026-08-12T00:00:00.000Z'),
    pacingConfig: { travelMode: 'DRIVING', level: 'normal', vehicleType: '4WD' },
    tepBundle,
    now,
  });

  await prisma.tripDay.create({ data: { id: PILOT_IS_10_DAY_ID, tripId, date: dayDate } });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_10_ITEM_START,
      tripDayId: PILOT_IS_10_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: JSON.stringify({ tepImportance: 'RECOMMENDED', tepFlexibility: 'MOVABLE' }),
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: PILOT_IS_10_ITEM_END,
      tripDayId: PILOT_IS_10_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 2,
      note: JSON.stringify({
        tepImportance: 'RECOMMENDED',
        tepFlexibility: 'REMOVABLE',
        routeSegmentId: PILOT_IS_10_ROAD_REF,
      }),
      travelFromPreviousDuration: 60,
      travelMode: 'DRIVING',
    },
  });

  return buildSeedResult({
    template: '10',
    tripId,
    planVersionId,
    certScenarioId,
    tepBundle,
    items: [PILOT_IS_10_ITEM_START, PILOT_IS_10_ITEM_END],
    runtimeNote: 'npm run tep:pilot-planning-smoke -- --template=10',
  });
}

function buildSeedResult(input: {
  template: string;
  tripId: string;
  planVersionId: string;
  certScenarioId: string;
  tepBundle: ReturnType<typeof buildTepMetadataFromCertScenario>;
  items: string[];
  runtimeNote?: string;
}): Record<string, unknown> {
  return {
    ok: true,
    template: `PILOT-IS-${input.template}`,
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    certScenarioId: input.certScenarioId,
    certAssessmentStatus: input.tepBundle.assessmentStatus,
    recoveryOptions: input.tepBundle.recoveryGraph.fallbackOptions.map((o) => o.optionId),
    items: input.items,
    ownerUserId: TEP_PILOT_USER_ID,
    ...(input.runtimeNote ? { runtimeNote: input.runtimeNote } : {}),
    verify: {
      executability: `GET /api/trips/${input.tripId}/executability?refresh=true`,
      adjustmentQueue: `GET /api/mobile/trips/${input.tripId}/execution/adjustment-queue`,
      acceptExample: `POST /api/mobile/trips/${input.tripId}/execution/tep-repairs/intervention-tep-{optionId}/accept`,
    },
  };
}
