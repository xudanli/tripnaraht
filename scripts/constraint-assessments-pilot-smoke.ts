#!/usr/bin/env npx tsx
/**
 * PILOT-IS-01 — Unified Constraint Assessment smoke (parallel lanes, no Nest)
 */
import 'reflect-metadata';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  PILOT_IS_01_ITEM_STOP,
  PILOT_IS_01_TRIP_ID,
} from './tep-pilot-is-seed.constants';
import { runConstraintAssessmentsSmokeForTrip } from './constraint-assessments-smoke.util';

const PROJECT_ROOT = join(__dirname, '..');

function parseTripId(argv: string[]): string {
  const hit = argv.find((a) => a.startsWith('--trip='));
  return hit?.split('=').slice(1).join('=') ?? PILOT_IS_01_TRIP_ID;
}

async function main(): Promise<void> {
  loadEnv({ path: join(PROJECT_ROOT, '.env') });
  loadEnv({ path: join(PROJECT_ROOT, '.env.staging'), override: true });

  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing constraint-assessments smoke on production DATABASE_URL');
  }

  const tripId = parseTripId(process.argv);
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new Error(`Trip ${tripId} missing — run: npm run tep:pilot-seed -- --template=01 --reset`);
    }

    const caseA = await runConstraintAssessmentsSmokeForTrip(prisma, tripId, {
      travelMinutes: 120,
      travelItemId: PILOT_IS_01_ITEM_STOP,
    });
    const viewA = caseA.items.find((item) => item.constraintKey === 'MAX_DAILY_DRIVE');

    const caseB = await runConstraintAssessmentsSmokeForTrip(prisma, tripId, {
      travelMinutes: 330,
      travelItemId: PILOT_IS_01_ITEM_STOP,
    });
    const viewB = caseB.items.find((item) => item.constraintKey === 'MAX_DAILY_DRIVE');

    if (!viewA || !viewB) {
      throw new Error('MAX_DAILY_DRIVE view missing from bundle');
    }

    const pass =
      (viewA.lanes.planning?.status ?? 'PASS') === 'PASS' &&
      (viewA.lanes.executability?.status ?? 'PASS') === 'PASS' &&
      viewA.aggregateStatus === 'PASS' &&
      (viewB.lanes.planning?.status ?? 'PASS') === 'PASS' &&
      viewB.lanes.executability?.status === 'BLOCK' &&
      viewB.lanes.executability?.ruleId === 'SDR-101' &&
      viewB.aggregateStatus === 'EXECUTION_BLOCK';

    console.log(
      JSON.stringify(
        {
          ok: pass,
          tripId,
          cases: [
            {
              label: 'Case A (120min)',
              planning: viewA.lanes.planning,
              executability: viewA.lanes.executability,
              aggregateStatus: viewA.aggregateStatus,
            },
            {
              label: 'Case B (330min)',
              planning: viewB.lanes.planning,
              executability: viewB.lanes.executability,
              aggregateStatus: viewB.aggregateStatus,
            },
          ],
        },
        null,
        2,
      ),
    );

    if (!pass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
