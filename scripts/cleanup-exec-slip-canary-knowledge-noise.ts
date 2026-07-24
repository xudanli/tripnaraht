#!/usr/bin/env npx tsx
/**
 * Patch live Exec Slip Canary — remove knowledge noise scope + seed Phase D recoveryGraph.
 *
 * Usage:
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/cleanup-exec-slip-canary-knowledge-noise.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { EXEC_SLIP_CANARY_TRIP_ID } from './prod-canary-execution-slip-pre-signoff.constants';
import { patchExecSlipCanaryPlanVersionMetadata } from './exec-slip-canary-recovery-graph.fixture';

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('tripnara_prod') && process.env.EXEC_SLIP_DRILL_ALLOW_PROD !== '1') {
    throw new Error('Set EXEC_SLIP_DRILL_ALLOW_PROD=1 for prod DATABASE_URL');
  }

  const prisma = new PrismaClient();
  const trip = await prisma.trip.findUnique({
    where: { id: EXEC_SLIP_CANARY_TRIP_ID },
    select: { id: true, metadata: true },
  });
  if (!trip) throw new Error(`Trip ${EXEC_SLIP_CANARY_TRIP_ID} not found`);

  const metadata = patchExecSlipCanaryPlanVersionMetadata(
    (trip.metadata ?? {}) as Record<string, unknown>,
  );

  await prisma.trip.update({
    where: { id: EXEC_SLIP_CANARY_TRIP_ID },
    data: { metadata, updatedAt: new Date() },
  });

  const tep = (metadata.rfc001PlanVersions as { items?: Array<{ metadata?: { tep?: unknown } }> })
    ?.items?.[0]?.metadata?.tep;
  console.log('[cleanup-exec-slip-canary] patched trip metadata');
  console.log('  knowledgeScope:', (metadata.executionSlipCanaryDrill as { knowledgeScope?: string })?.knowledgeScope);
  console.log(
    '  recoveryOptions:',
    (tep as { recoveryGraph?: { fallbackOptions?: Array<{ optionId: string }> } })?.recoveryGraph
      ?.fallbackOptions?.map((o) => o.optionId)
      .join(', ') ?? 'none',
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
