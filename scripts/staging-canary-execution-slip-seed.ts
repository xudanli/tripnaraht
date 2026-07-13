#!/usr/bin/env npx tsx
/**
 * Seed Execution Slip Canary on staging + inject Slice 4 Attention problem fixtures.
 *
 * Usage:
 *   npm run attention:staging-seed
 *   npm run attention:staging-seed -- --profile=slice4-b
 *   npm run attention:staging-seed -- --reset
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  EVIDENCE_DIR,
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_ACTIVITY_B_ID,
  EXEC_SLIP_CANARY_ACTIVITY_C_ID,
  EXEC_SLIP_CANARY_COLLABORATOR_ID,
  EXEC_SLIP_CANARY_DAY_ID,
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
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  allowlistTripIds,
  assertInitialPlan,
  gitCommitSha,
  isOnWeatherOrRoadAllowlist,
  openProblems,
  summarizeChecks,
  today,
  tripMetadata,
  type AcceptanceCheck,
} from './prod-canary-execution-slip-pre-signoff.util';
import {
  buildAttentionSeedProblems,
  defaultAttentionSeedProfile,
  type AttentionSeedProfile,
} from './staging-canary-attention-seed-problems.util';
import { patchExecSlipCanaryInfeasibleWorkspace } from './exec-slip-canary-infeasible-workspace.fixture';

const PROJECT_ROOT = join(__dirname, '..');

function parseEnvProfile(argv: string[]): 'staging' | 'default' {
  const hit = argv.find((a) => a.startsWith('--env='));
  const explicit = hit?.split('=').slice(1).join('=');
  if (explicit === 'default' || explicit === 'local') return 'default';
  return 'staging';
}

function loadProjectEnv(profile: 'staging' | 'default'): void {
  loadEnv({ path: join(PROJECT_ROOT, '.env') });
  if (profile === 'staging') {
    loadEnv({ path: join(PROJECT_ROOT, '.env.staging'), override: true });
  }
}

loadProjectEnv(parseEnvProfile(process.argv));

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback;
}

function assertStagingDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing to seed on production DATABASE_URL — use --env=staging');
  }
  if (!url.includes('tripnara_staging')) {
    throw new Error('Expected tripnara_staging DATABASE_URL');
  }
}

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
  assertStagingDatabase();
  const reset = process.argv.includes('--reset');
  const profile = (arg('profile', defaultAttentionSeedProfile()) ?? defaultAttentionSeedProfile()) as AttentionSeedProfile;
  const problems = buildAttentionSeedProblems(profile);
  const prisma = new PrismaClient();
  const now = new Date();
  const dayDate = new Date('2026-07-12T00:00:00.000Z');

  try {
    if (reset) await cleanup(prisma);
    await ensurePlaces(prisma, now);
    await ensureCanaryUser(prisma, now);

    const metadataBase = {
      revision: 1,
      internalTest: true,
      stagingCanary: true,
      canaryPurpose: 'EXECUTION_SLIP_SLICE_3_ATTENTION_SLICE_4',
      executionSlipLiveWriteEnabled: false,
      legacyWriteInvocations: 0,
      executionDepartureObservations: {},
      rfc001WorldState: { assertions: [], snapshots: [], events: [] },
      rfc001DecisionProblems: { items: problems, lastUpdatedAt: now.toISOString() },
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
            createdBy: 'STAGING_ATTENTION_SEED',
            operations: [],
            effectiveAt: now.toISOString(),
            materializedPlanSnapshotRef: EXEC_SLIP_INITIAL_SNAPSHOT_REF,
          },
        ],
        effectivePlanVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
        lastUpdatedAt: now.toISOString(),
      },
      attentionShadowSeed: {
        profile,
        seededAt: now.toISOString(),
        problemIds: problems.map((p) => p.problemId),
      },
    };

    const metadata = problems.some((p) => p.problemId === 'stg_attn_infeasible')
      ? patchExecSlipCanaryInfeasibleWorkspace(metadataBase)
      : metadataBase;

    await prisma.trip.upsert({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      create: {
        id: EXEC_SLIP_CANARY_TRIP_ID,
        name: 'Execution Slip Canary Trip (Staging)',
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
        id: 'SEED-TRIP',
        pass: Boolean(seeded),
        detail: `tripId=${EXEC_SLIP_CANARY_TRIP_ID}`,
      },
      {
        id: 'SEED-ATTENTION-PROBLEMS',
        pass: listProblems(meta).length === problems.length,
        detail: `problems=${listProblems(meta).length} profile=${profile}`,
      },
      {
        id: 'SEED-NOT-WEATHER-ROAD-ALLOWLIST',
        pass: !isOnWeatherOrRoadAllowlist(EXEC_SLIP_CANARY_TRIP_ID),
        detail: `allowlist=${allowlistTripIds().join(',') || '(empty)'}`,
      },
    ];
    const seedPass = summarizeChecks(checks);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evidencePath = `${EVIDENCE_DIR}/execution-slip-staging-attention-seed-${today()}.json`;
    const evidence = {
      evidenceType: 'EXECUTION_SLIP_STAGING_ATTENTION_SEED',
      environment: 'tripnara_staging',
      tripId: EXEC_SLIP_CANARY_TRIP_ID,
      profile,
      commitSha: gitCommitSha(),
      seededAt: now.toISOString(),
      problems: problems.map((p) => ({
        problemId: p.problemId,
        semanticCapability: p.semanticCapability,
        status: p.status,
        weatherEpisodeId: p.weatherEpisodeId,
        causedByProblemId: p.causedByProblemId,
      })),
      checks,
      result: seedPass ? 'PASS' : 'FAIL',
    };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

    console.log(`Execution Slip Canary seeded on staging: ${EXEC_SLIP_CANARY_TRIP_ID}`);
    console.log(`Attention profile=${profile} problems=${problems.length}`);
    console.log(`Evidence: ${evidencePath}`);
    if (!seedPass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function listProblems(meta: Record<string, unknown>) {
  const block = meta.rfc001DecisionProblems as { items?: unknown[] } | undefined;
  return block?.items ?? [];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
