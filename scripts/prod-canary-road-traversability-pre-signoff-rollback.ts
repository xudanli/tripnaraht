#!/usr/bin/env npx tsx
/**
 * Traversability T2 — rollback to plan_1 + verify Weather soak unchanged.
 *
 * Usage:
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-rollback.ts
 */
import 'reflect-metadata';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  EVIDENCE_DIR,
  ROAD_CANARY_INITIAL_PLAN_ID,
  ROAD_CANARY_TRIP_ID,
  TRAVERSABILITY_DRILL_STATUS,
  TRAVERSABILITY_EVIDENCE_LABEL,
  TRAVERSABILITY_GO_STATUS,
  WEATHER_CANARY_TRIP_ID,
} from './prod-canary-road-traversability-pre-signoff.constants';
import {
  arg,
  assertProdDatabase,
  readWeatherSoakSnapshot,
  today,
} from './prod-canary-road-traversability-pre-signoff.util';

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
    throw new Error('Set ROAD_DRILL_ALLOW_PROD=1 to rollback traversability drill on tripnara_prod');
  }

  const prisma = new PrismaClient();
  const baselineLabel = arg('baseline-label', 'pre-traversability')!;

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
    meta.rfc001WorldState = { assertions: [], events: [], snapshots: [] };
    meta.rfc001DecisionProblems = { items: [] };

    await prisma.trip.update({
      where: { id: ROAD_CANARY_TRIP_ID },
      data: { metadata: meta, updatedAt: new Date() },
    });

    const preWeather = (pre?.weatherSnapshot ?? {}) as Record<string, unknown>;
    const weatherUnchanged =
      preWeather.weatherEffectivePlanVersionId === postWeather.weatherEffectivePlanVersionId &&
      preWeather.gitCommit === postWeather.gitCommit;

    const evidence = {
      evidenceType: 'ROAD_TRAVERSABILITY_PRE_SIGNOFF_ROLLBACK',
      evidenceLabel: TRAVERSABILITY_EVIDENCE_LABEL,
      drillDefinition: 'Prod Canary Road Traversability T2 Pre-Signoff Drill',
      drillStatus: TRAVERSABILITY_DRILL_STATUS,
      productionCanaryGoStatus: TRAVERSABILITY_GO_STATUS,
      tripId: ROAD_CANARY_TRIP_ID,
      weatherCanaryTripId: WEATHER_CANARY_TRIP_ID,
      effectivePlanVersionId: ROAD_CANARY_INITIAL_PLAN_ID,
      baselineLabel,
      baselineFound: Boolean(pre),
      weatherUnchanged,
      preWeatherSnapshot: preWeather,
      postWeatherSnapshot: postWeather,
      result: weatherUnchanged ? 'PASS' : 'FAIL',
      rolledBackAt: new Date().toISOString(),
    };

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const out = `${EVIDENCE_DIR}/road-traversability-rollback-${today()}.json`;
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
