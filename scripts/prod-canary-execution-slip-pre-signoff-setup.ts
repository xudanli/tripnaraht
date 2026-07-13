#!/usr/bin/env npx tsx
/**
 * S4-1 — Seed independent Execution Slip Canary Trip (NOT Weather/Road canary).
 *
 * Usage:
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-setup.ts --reset
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  DRILL_STATUS,
  EVIDENCE_DIR,
  EVIDENCE_LABEL,
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_ACTIVITY_B_ID,
  EXEC_SLIP_CANARY_ACTIVITY_C_ID,
  EXEC_SLIP_CANARY_DAY_ID,
  EXEC_SLIP_CANARY_COLLABORATOR_ID,
  EXEC_SLIP_CANARY_EMAIL,
  EXEC_SLIP_CANARY_PLACE_A_ID,
  EXEC_SLIP_CANARY_PLACE_B_ID,
  EXEC_SLIP_CANARY_PLACE_C_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_CANARY_USER_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
  EXEC_SLIP_INITIAL_SNAPSHOT_REF,
  EXEC_SLIP_REMAINING_STAY_MINUTES,
  EXEC_SLIP_SCENARIO_A_PLANNED_DEPART,
  EXEC_SLIP_TRAVEL_MINUTES,
  GO_STATUS,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  allowlistTripIds,
  assertInitialPlan,
  assertProdDatabase,
  gitCommitSha,
  isOnWeatherOrRoadAllowlist,
  openProblems,
  requireProdWrite,
  summarizeChecks,
  today,
  tripMetadata,
  type AcceptanceCheck,
} from './prod-canary-execution-slip-pre-signoff.util';
import { patchExecSlipCanaryPlanVersionMetadata } from './exec-slip-canary-recovery-graph.fixture';

async function ensureCanaryUser(prisma: PrismaClient, now: Date): Promise<void> {
  await prisma.user.upsert({
    where: { id: EXEC_SLIP_CANARY_USER_ID },
    create: {
      id: EXEC_SLIP_CANARY_USER_ID,
      email: EXEC_SLIP_CANARY_EMAIL,
      emailVerified: true,
      displayName: 'Execution Slip Canary',
      updatedAt: now,
    },
    update: {
      email: EXEC_SLIP_CANARY_EMAIL,
      emailVerified: true,
      displayName: 'Execution Slip Canary',
      updatedAt: now,
    },
  });
}

async function cleanup(prisma: PrismaClient): Promise<void> {
  await prisma.itineraryItem.deleteMany({ where: { tripDayId: EXEC_SLIP_CANARY_DAY_ID } });
  await prisma.tripDay.deleteMany({ where: { tripId: EXEC_SLIP_CANARY_TRIP_ID } });
  await prisma.tripCollaborator.deleteMany({ where: { tripId: EXEC_SLIP_CANARY_TRIP_ID } });
  await prisma.trip.deleteMany({ where: { id: EXEC_SLIP_CANARY_TRIP_ID } });
}

async function ensurePlaces(prisma: PrismaClient, now: Date): Promise<void> {
  const places = [
    {
      id: EXEC_SLIP_CANARY_PLACE_A_ID,
      uuid: `exec-slip-canary-a-${EXEC_SLIP_CANARY_PLACE_A_ID}`,
      nameCN: 'Exec Slip Canary POI A',
      nameEN: 'Exec Slip Canary POI A',
      category: 'ATTRACTION' as const,
      metadata: { poiKey: 'poi_a', lat: 64.12, lng: -21.9, regionId: 'reykjavik_area' },
      updatedAt: now,
    },
    {
      id: EXEC_SLIP_CANARY_PLACE_B_ID,
      uuid: `exec-slip-canary-b-${EXEC_SLIP_CANARY_PLACE_B_ID}`,
      nameCN: 'Exec Slip Canary POI B (Timed)',
      nameEN: 'Exec Slip Canary POI B (Timed)',
      category: 'ATTRACTION' as const,
      metadata: {
        poiKey: 'poi_b_timed',
        lat: 64.15,
        lng: -21.95,
        regionId: 'reykjavik_area',
        lastEntryAt: '16:00',
        closesAt: '18:00',
        timezone: 'Atlantic/Reykjavik',
      },
      updatedAt: now,
    },
    {
      id: EXEC_SLIP_CANARY_PLACE_C_ID,
      uuid: `exec-slip-canary-c-${EXEC_SLIP_CANARY_PLACE_C_ID}`,
      nameCN: 'Exec Slip Canary POI C (Substitute)',
      nameEN: 'Exec Slip Canary POI C (Substitute)',
      category: 'ATTRACTION' as const,
      metadata: {
        poiKey: 'poi_nearby_substitute',
        lat: 64.14,
        lng: -21.92,
        regionId: 'reykjavik_area',
        lastEntryAt: '18:00',
        closesAt: '20:00',
        timezone: 'Atlantic/Reykjavik',
      },
      updatedAt: now,
    },
  ];
  for (const p of places) {
    await prisma.place.upsert({
      where: { id: p.id },
      create: p,
      update: { nameCN: p.nameCN, nameEN: p.nameEN, metadata: p.metadata, updatedAt: now },
    });
  }
}

async function main() {
  assertProdDatabase();
  requireProdWrite();
  const reset = process.argv.includes('--reset');
  const prisma = new PrismaClient();
  const now = new Date();
  const dayDate = new Date('2026-07-12T00:00:00.000Z');

  try {
    const existing = await prisma.trip.findUnique({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      select: { metadata: true },
    });
    if (existing?.metadata) {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const baselinePath = `${EVIDENCE_DIR}/execution-slip-canary-baseline-${today()}.json`;
      writeFileSync(
        baselinePath,
        JSON.stringify(
          {
            tripId: EXEC_SLIP_CANARY_TRIP_ID,
            savedAt: now.toISOString(),
            commitSha: gitCommitSha(),
            metadata: existing.metadata,
          },
          null,
          2,
        ),
      );
      console.log(`Rollback baseline saved: ${baselinePath}`);
    }

    if (reset) await cleanup(prisma);
    await ensurePlaces(prisma, now);
    await ensureCanaryUser(prisma, now);

    const metadata = patchExecSlipCanaryPlanVersionMetadata({
      revision: 1,
      internalTest: true,
      productionCanary: true,
      canaryPurpose: 'EXECUTION_SLIP_SLICE_3',
      executionSlipLiveWriteEnabled: false,
      legacyWriteInvocations: 0,
      executionDepartureObservations: {},
      rfc001WorldState: { assertions: [], snapshots: [], events: [] },
      rfc001DecisionProblems: { items: [], lastUpdatedAt: now.toISOString() },
      rfc001DecisionWorkspaces: { items: [], lastUpdatedAt: now.toISOString() },
      rfc001DecisionLedger: { items: [], lastUpdatedAt: now.toISOString() },
      rfc001DecisionRuns: { items: [], lastUpdatedAt: now.toISOString() },
      rfc001ExecutionActivityContext: {
        byActivityId: {
          [EXEC_SLIP_CANARY_ACTIVITY_A_ID]: {
            plannedDepartAt: EXEC_SLIP_SCENARIO_A_PLANNED_DEPART,
            remainingStayMinutes: EXEC_SLIP_REMAINING_STAY_MINUTES,
          },
          [EXEC_SLIP_CANARY_ACTIVITY_B_ID]: {
            executionWindow: {
              lastEntryAt: '16:00',
              closesAt: '18:00',
              timezone: 'Atlantic/Reykjavik',
            },
          },
        },
      },
      rfc001PlanVersions: {
        items: [
          {
            planVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
            tripId: EXEC_SLIP_CANARY_TRIP_ID,
            status: 'EFFECTIVE',
            createdAt: now.toISOString(),
            createdBy: 'EXEC_SLIP_PRE_SIGNOFF_SETUP',
            operations: [],
            effectiveAt: now.toISOString(),
            materializedPlanSnapshotRef: EXEC_SLIP_INITIAL_SNAPSHOT_REF,
          },
        ],
        effectivePlanVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
        lastUpdatedAt: now.toISOString(),
      },
      executionSlipCanaryDrill: {
        scenarioA: { observedAt: '2026-07-12T13:35:00.000Z', projectedEta: '2026-07-12T16:18:00.000Z' },
        scenarioB: { observedAt: '2026-07-12T13:10:00.000Z', projectedEta: '2026-07-12T15:45:00.000Z' },
        substituteActivityId: EXEC_SLIP_CANARY_ACTIVITY_C_ID,
      },
    });

    await prisma.trip.upsert({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      create: {
        id: EXEC_SLIP_CANARY_TRIP_ID,
        name: 'Execution Slip Canary Trip',
        destination: 'IS',
        startDate: dayDate,
        endDate: new Date('2026-07-13T00:00:00.000Z'),
        status: 'TRAVELING',
        metadata,
        updatedAt: now,
      },
      update: { metadata, status: 'TRAVELING', updatedAt: now },
    });

    await prisma.tripCollaborator.upsert({
      where: {
        tripId_userId: { tripId: EXEC_SLIP_CANARY_TRIP_ID, userId: EXEC_SLIP_CANARY_USER_ID },
      },
      create: {
        id: EXEC_SLIP_CANARY_COLLABORATOR_ID,
        tripId: EXEC_SLIP_CANARY_TRIP_ID,
        userId: EXEC_SLIP_CANARY_USER_ID,
        role: 'OWNER',
      },
      update: { role: 'OWNER' },
    });

    await prisma.tripDay.upsert({
      where: { id: EXEC_SLIP_CANARY_DAY_ID },
      create: {
        id: EXEC_SLIP_CANARY_DAY_ID,
        tripId: EXEC_SLIP_CANARY_TRIP_ID,
        date: dayDate,
      },
      update: { date: dayDate },
    });

    const items = [
      {
        id: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
        tripDayId: EXEC_SLIP_CANARY_DAY_ID,
        type: 'ACTIVITY' as const,
        placeId: EXEC_SLIP_CANARY_PLACE_A_ID,
        startTime: new Date('2026-07-12T10:00:00.000Z'),
        endTime: new Date(EXEC_SLIP_SCENARIO_A_PLANNED_DEPART),
        order: 1,
        travelFromPreviousDuration: 0,
      },
      {
        id: EXEC_SLIP_CANARY_ACTIVITY_B_ID,
        tripDayId: EXEC_SLIP_CANARY_DAY_ID,
        type: 'ACTIVITY' as const,
        placeId: EXEC_SLIP_CANARY_PLACE_B_ID,
        startTime: new Date('2026-07-12T16:00:00.000Z'),
        endTime: new Date('2026-07-12T18:00:00.000Z'),
        order: 2,
        travelFromPreviousDuration: EXEC_SLIP_TRAVEL_MINUTES,
      },
      {
        id: EXEC_SLIP_CANARY_ACTIVITY_C_ID,
        tripDayId: EXEC_SLIP_CANARY_DAY_ID,
        type: 'ACTIVITY' as const,
        placeId: EXEC_SLIP_CANARY_PLACE_C_ID,
        startTime: new Date('2026-07-12T17:00:00.000Z'),
        endTime: new Date('2026-07-12T19:00:00.000Z'),
        order: 3,
        travelFromPreviousDuration: 30,
      },
    ];

    for (const item of items) {
      await prisma.itineraryItem.upsert({
        where: { id: item.id },
        create: item,
        update: {
          startTime: item.startTime,
          endTime: item.endTime,
          placeId: item.placeId,
          travelFromPreviousDuration: item.travelFromPreviousDuration,
        },
      });
    }

    const seeded = await prisma.trip.findUnique({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      select: { metadata: true },
    });
    const meta = tripMetadata(seeded?.metadata);
    const checks: AcceptanceCheck[] = [
      assertInitialPlan(meta),
      {
        id: 'SEED-ACTIVITY-A',
        pass: Boolean(await prisma.itineraryItem.findUnique({ where: { id: EXEC_SLIP_CANARY_ACTIVITY_A_ID } })),
        detail: `activityA=${EXEC_SLIP_CANARY_ACTIVITY_A_ID}`,
      },
      {
        id: 'SEED-ACTIVITY-B',
        pass: Boolean(await prisma.itineraryItem.findUnique({ where: { id: EXEC_SLIP_CANARY_ACTIVITY_B_ID } })),
        detail: `activityB=${EXEC_SLIP_CANARY_ACTIVITY_B_ID} lastEntryAt=16:00`,
      },
      {
        id: 'SEED-SUBSTITUTE-C',
        pass: Boolean(await prisma.itineraryItem.findUnique({ where: { id: EXEC_SLIP_CANARY_ACTIVITY_C_ID } })),
        detail: `substituteC=${EXEC_SLIP_CANARY_ACTIVITY_C_ID}`,
      },
      {
        id: 'SEED-NO-OPEN-PROBLEM',
        pass: openProblems(meta).length === 0,
        detail: `openProblems=${openProblems(meta).length}`,
      },
      {
        id: 'SEED-NOT-WEATHER-ROAD-ALLOWLIST',
        pass: !isOnWeatherOrRoadAllowlist(EXEC_SLIP_CANARY_TRIP_ID),
        detail: `onWeatherRoadAllowlist=${isOnWeatherOrRoadAllowlist(EXEC_SLIP_CANARY_TRIP_ID)} allowlist=${allowlistTripIds().join(',') || '(empty)'}`,
      },
    ];
    const seedPass = summarizeChecks(checks);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evidence = {
      label: EVIDENCE_LABEL,
      evidenceType: 'EXECUTION_SLIP_CANARY_TRIP_SEED',
      date: today(),
      commitSha: gitCommitSha(),
      environment: process.env.DATABASE_URL?.includes('tripnara_prod') ? 'tripnara_prod' : 'unknown',
      drillStatus: DRILL_STATUS,
      goStatus: GO_STATUS,
      seedStatus: seedPass ? 'Execution Slip Canary Trip Seed = PASS' : 'Execution Slip Canary Trip Seed = FAIL',
      tripId: EXEC_SLIP_CANARY_TRIP_ID,
      planVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
      activityA: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
      activityB: EXEC_SLIP_CANARY_ACTIVITY_B_ID,
      substituteC: EXEC_SLIP_CANARY_ACTIVITY_C_ID,
      setupAt: now.toISOString(),
      checks,
      result: seedPass ? 'PASS' : 'FAIL',
    };
    const path = `${EVIDENCE_DIR}/execution-slip-canary-setup-${today()}.json`;
    writeFileSync(path, JSON.stringify(evidence, null, 2));
    console.log(`Execution Slip Canary Trip ready: ${EXEC_SLIP_CANARY_TRIP_ID}`);
    console.log(`Seed status: ${evidence.seedStatus}`);
    console.log(`Evidence: ${path}`);
    if (!seedPass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
