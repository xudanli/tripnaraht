/**
 * Reset stuck decision-problem resolution rows in trip.metadata.
 *
 * Usage:
 *   npx tsx scripts/decision-resolution-store-repair.ts [tripId] [problemIdSubstring]
 *
 * Example:
 *   npx tsx scripts/decision-resolution-store-repair.ts 510d95ce-... 80c138ae
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { toInputJsonValue } from '../src/trips/budget-os/utils/prisma-json.util';

const METADATA_KEY = 'decisionProblemResolutions';

type Stored = {
  problemId: string;
  status: string;
  failureMessage?: string;
  [key: string]: unknown;
};

async function main(): Promise<void> {
  const tripId = process.argv[2] ?? '510d95ce-7cc4-4a07-8aba-2d4694451a3c';
  const match = process.argv[3] ?? '80c138ae';
  const prisma = new PrismaClient();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) {
    console.error(`trip not found: ${tripId}`);
    process.exit(1);
  }

  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const state = (meta[METADATA_KEY] as { byProblemId?: Record<string, Stored> }) ?? {
    byProblemId: {},
  };
  const byProblemId = { ...(state.byProblemId ?? {}) };

  let repaired = 0;
  for (const [problemId, row] of Object.entries(byProblemId)) {
    if (!problemId.includes(match)) continue;
    if (row.status !== 'APPLYING' && row.status !== 'FAILED') {
      console.log(`skip ${problemId}: status=${row.status}`);
      continue;
    }
    const idempotencyKey =
      typeof row.idempotencyKey === 'string'
        ? row.idempotencyKey.replace(/:apply-probe$/, '')
        : row.idempotencyKey;
    if (idempotencyKey !== row.idempotencyKey) {
      console.log(`  normalize idempotencyKey → ${idempotencyKey}`);
    }
    byProblemId[problemId] = {
      ...row,
      status: 'AUTHORIZED',
      failureMessage: undefined,
      decisionId: undefined,
      idempotencyKey,
    };
    repaired += 1;
    console.log(`✓ reset ${problemId}: ${row.status} → AUTHORIZED`);
  }

  if (!repaired) {
    console.log(`no APPLYING/FAILED rows matched "${match}"`);
    await prisma.$disconnect();
    return;
  }

  await prisma.trip.update({
    where: { id: tripId },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        [METADATA_KEY]: { byProblemId },
      }),
    },
  });

  console.log(`\nrepaired ${repaired} resolution(s) on trip ${tripId}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
