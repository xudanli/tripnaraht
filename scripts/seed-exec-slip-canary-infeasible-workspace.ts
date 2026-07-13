#!/usr/bin/env npx tsx
/**
 * Seed DecisionWorkspace repair candidates for stg_attn_infeasible on Exec Slip Canary.
 *
 * Usage:
 *   npx tsx scripts/seed-exec-slip-canary-infeasible-workspace.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { EXEC_SLIP_CANARY_TRIP_ID } from './prod-canary-execution-slip-pre-signoff.constants';
import { patchExecSlipCanaryInfeasibleWorkspace } from './exec-slip-canary-infeasible-workspace.fixture';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');

  const prisma = new PrismaClient();
  const trip = await prisma.trip.findUnique({
    where: { id: EXEC_SLIP_CANARY_TRIP_ID },
    select: { id: true, metadata: true },
  });
  if (!trip) throw new Error(`Trip ${EXEC_SLIP_CANARY_TRIP_ID} not found`);

  const metadata = patchExecSlipCanaryInfeasibleWorkspace(
    (trip.metadata ?? {}) as Record<string, unknown>,
  );

  await prisma.trip.update({
    where: { id: EXEC_SLIP_CANARY_TRIP_ID },
    data: { metadata, updatedAt: new Date() },
  });

  const workspace = (
    metadata.rfc001DecisionWorkspaces as { items?: Array<{ repairCandidates?: unknown[] }> }
  )?.items?.find((w) => (w as { problemId?: string }).problemId === 'stg_attn_infeasible');

  console.log('[seed-exec-slip-canary-infeasible-workspace] patched trip metadata');
  console.log(
    '  repairCandidates:',
    workspace?.repairCandidates?.length ?? 0,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
