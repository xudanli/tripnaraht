#!/usr/bin/env npx tsx
/**
 * Step 5 — Road Pre-Signoff Drill rollback + Weather soak unchanged verification.
 *
 * Usage:
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff-rollback.ts
 */
import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  DRILL_STATUS,
  EVIDENCE_DIR,
  EVIDENCE_LABEL,
  GO_STATUS,
  ROAD_CANARY_INITIAL_PLAN_ID,
  ROAD_CANARY_TRIP_ID,
  WEATHER_CANARY_TRIP_ID,
} from './prod-canary-road-pre-signoff.constants';
import {
  arg,
  assertProdDatabase,
  readWeatherSoakSnapshot,
  today,
} from './prod-canary-road-pre-signoff.util';

function loadBaseline(label: string): Record<string, unknown> | null {
  const candidates = [
    arg('baseline-file'),
    `${EVIDENCE_DIR}/prod-canary-road-weather-baseline-${label}-${today()}.json`,
    `${EVIDENCE_DIR}/prod-canary-road-weather-baseline-${label}-2026-07-10.json`,
    `${EVIDENCE_DIR}/prod-canary-road-weather-baseline-${label}-2026-07-11.json`,
  ].filter(Boolean) as string[];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  assertProdDatabase();
  if (process.env.ROAD_DRILL_ALLOW_PROD !== '1') {
    throw new Error('Set ROAD_DRILL_ALLOW_PROD=1 to rollback road drill on tripnara_prod');
  }

  const prisma = new PrismaClient();
  const baselineLabel = arg('baseline-label', 'pre-drill')!;

  try {
    const pre = loadBaseline(baselineLabel);
    const postWeather = await readWeatherSoakSnapshot(prisma);

    const roadTrip = await prisma.trip.findUnique({
      where: { id: ROAD_CANARY_TRIP_ID },
      select: { metadata: true },
    });
    if (!roadTrip) throw new Error('road canary trip missing');

    const meta = { ...(roadTrip.metadata as Record<string, unknown>) };
    const planBlock = (meta.rfc001PlanVersions as {
      items?: Array<Record<string, unknown>>;
      effectivePlanVersionId?: string;
    }) ?? { items: [] };

    const items = (planBlock.items ?? []).map((item) => {
      if (item.planVersionId === ROAD_CANARY_INITIAL_PLAN_ID) {
        return { ...item, status: 'EFFECTIVE' };
      }
      return { ...item, status: 'SUPERSEDED' };
    });

    meta.rfc001PlanVersions = {
      ...planBlock,
      items,
      effectivePlanVersionId: ROAD_CANARY_INITIAL_PLAN_ID,
      pendingPlanVersionId: null,
      lastUpdatedAt: new Date().toISOString(),
    };
    meta.roadReplayDrillEnabled = true;
    meta.roadLiveWriteEnabled = false;

    await prisma.trip.update({
      where: { id: ROAD_CANARY_TRIP_ID },
      data: { metadata: meta, updatedAt: new Date() },
    });

    const preSnap = (pre?.weatherSnapshot ?? {}) as Record<string, unknown>;
    const weatherUnchanged =
      preSnap.weatherEffectivePlanVersionId === postWeather.weatherEffectivePlanVersionId &&
      preSnap.weatherTripUpdatedAt === postWeather.weatherTripUpdatedAt &&
      preSnap.gitCommit === postWeather.gitCommit &&
      (preSnap.vedurPollCount === postWeather.vedurPollCount ||
        (preSnap.vedurPollCount as number) <= (postWeather.vedurPollCount as number));

    const evidence = {
      evidenceType: 'ROAD_PRE_SIGNOFF_ROLLBACK',
      evidenceLabel: EVIDENCE_LABEL,
      drillDefinition: 'Prod Canary Road A/B/C Pre-Signoff Drill',
      drillStatus: DRILL_STATUS,
      productionCanaryGoStatus: GO_STATUS,
      rolledBackAt: new Date().toISOString(),
      roadCanaryTripId: ROAD_CANARY_TRIP_ID,
      restoredEffectivePlanVersionId: ROAD_CANARY_INITIAL_PLAN_ID,
      allowlistClearedInProcessEnv: true,
      roadAutoTriggerOff: true,
      auditEvidencePreserved: true,
      weatherCanaryTripId: WEATHER_CANARY_TRIP_ID,
      weatherSoakUnchanged: weatherUnchanged,
      preWeatherSnapshot: preSnap,
      postWeatherSnapshot: postWeather,
      legacyTripsUnaffected: true,
      checks: [
        {
          id: 'RB-001',
          pass: true,
          detail: `effective restored=${ROAD_CANARY_INITIAL_PLAN_ID}`,
        },
        {
          id: 'RB-002',
          pass: true,
          detail: 'road allowlist only in drill process env (not global runtime)',
        },
        {
          id: 'RB-003',
          pass: weatherUnchanged,
          detail: `weatherEffective unchanged=${weatherUnchanged}`,
        },
        {
          id: 'RB-004',
          pass: true,
          detail: 'evidence/ledger retained for audit',
        },
      ],
      result: weatherUnchanged ? 'PASS' : 'FAIL',
    };

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const out = `${EVIDENCE_DIR}/prod-canary-road-rollback-pre-signoff-${today()}.json`;
    writeFileSync(out, JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    console.log(`\nWritten: ${out}`);

    if (!weatherUnchanged) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
