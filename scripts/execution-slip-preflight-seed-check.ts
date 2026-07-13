#!/usr/bin/env npx tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_ACTIVITY_B_ID,
  EXEC_SLIP_CANARY_ACTIVITY_C_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  assertProdDatabase,
  effectivePlanVersionId,
  openProblems,
  requireProdWrite,
  tripMetadata,
} from './prod-canary-execution-slip-pre-signoff.util';

async function main() {
  assertProdDatabase();
  requireProdWrite();
  const prisma = new PrismaClient();
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: EXEC_SLIP_CANARY_TRIP_ID },
      select: { metadata: true },
    });
    if (!trip) throw new Error(`Canary trip missing: ${EXEC_SLIP_CANARY_TRIP_ID}`);

    const meta = tripMetadata(trip.metadata);
    const effective = effectivePlanVersionId(meta);
    if (effective !== EXEC_SLIP_INITIAL_PLAN_ID) {
      throw new Error(`effectivePlan=${effective} expected ${EXEC_SLIP_INITIAL_PLAN_ID} — run setup --reset`);
    }

    for (const [label, id] of [
      ['A', EXEC_SLIP_CANARY_ACTIVITY_A_ID],
      ['B', EXEC_SLIP_CANARY_ACTIVITY_B_ID],
      ['C', EXEC_SLIP_CANARY_ACTIVITY_C_ID],
    ] as const) {
      const item = await prisma.itineraryItem.findUnique({ where: { id } });
      if (!item) throw new Error(`Activity ${label} missing (${id}) — run setup --reset`);
    }

    const open = openProblems(meta).filter(
      (p) => p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE',
    );
    if (open.length > 0) {
      console.log(`WARN: ${open.length} open EXECUTION_SCHEDULE problem(s) — reset recommended`);
    }

    console.log(`PASS: trip=${EXEC_SLIP_CANARY_TRIP_ID} effective=${effective} A/B/C present`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message ?? e);
  process.exit(1);
});
