#!/usr/bin/env npx tsx
/**
 * Rollback Execution Slip Canary Trip to baseline (S4 Phase D).
 *
 * Usage: EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-pre-signoff-rollback.ts
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  EVIDENCE_DIR,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import { assertProdDatabase, today } from './prod-canary-execution-slip-pre-signoff.util';

async function main() {
  assertProdDatabase();
  if (process.env.EXEC_SLIP_DRILL_ALLOW_PROD !== '1') {
    throw new Error('Set EXEC_SLIP_DRILL_ALLOW_PROD=1');
  }

  const prisma = new PrismaClient();
  const now = new Date().toISOString();

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      select: { metadata: true },
    });
    if (!trip) throw new Error(`Canary trip ${EXEC_SLIP_CANARY_TRIP_ID} not found`);

    const meta = (trip.metadata ?? {}) as Record<string, unknown>;
    const cleaned = {
      ...meta,
      executionDepartureObservations: {},
      rfc001WorldState: { assertions: [], snapshots: [], events: [] },
      rfc001DecisionProblems: { items: [] },
      legacyWriteInvocations: 0,
      rfc001PlanVersions: {
        ...(meta.rfc001PlanVersions as object),
        effectivePlanVersionId: EXEC_SLIP_INITIAL_PLAN_ID,
        lastUpdatedAt: now,
      },
      executionSlipCanaryDrill: {
        ...(meta.executionSlipCanaryDrill as object),
        lastRollbackAt: now,
      },
    };

    await prisma.trip.update({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      data: { metadata: cleaned, updatedAt: new Date() },
    });

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const path = `${EVIDENCE_DIR}/execution-slip-canary-rollback-${today()}.json`;
    writeFileSync(
      path,
      JSON.stringify({ tripId: EXEC_SLIP_CANARY_TRIP_ID, rolledBackAt: now }, null, 2),
    );
    console.log(`Rollback complete. Evidence: ${path}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
