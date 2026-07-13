#!/usr/bin/env npx tsx
/**
 * Concurrent smoke: PILOT-IS-06 dual accept → single PlanVersion (IS-CERT-401-CONCURRENT).
 *
 * Prerequisite:
 *   npm run tep:pilot-seed -- --template=06 --reset
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import {
  PILOT_IS_06_ITEM_STOP,
  PILOT_IS_06_PLAN_VERSION_ID,
  PILOT_IS_06_TRIP_ID,
  TEP_PILOT_USER_ID,
} from './tep-pilot-is-seed.constants';
import {
  assertSafeDatabase,
  buildPilotWritebackStack,
  loadProjectEnv,
  parseEnvProfile,
  readSeededRecoveryGraph,
} from './tep-pilot-smoke.util';

export async function runPilotIs06ConcurrentSmoke(
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: PILOT_IS_06_TRIP_ID },
    select: { metadata: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${PILOT_IS_06_TRIP_ID} not found — run: npm run tep:pilot-seed -- --template=06 --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const recoveryGraph = readSeededRecoveryGraph(metadata);
  if (!recoveryGraph?.fallbackOptions.length) {
    throw new Error('pilot_is_06 missing seeded recoveryGraph.fallbackOptions');
  }

  const option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes('activity_stop_6'),
  );
  if (!option) {
    throw new Error('No REMOVE option for pilot_is_06 concurrent smoke');
  }

  const beforeItem = await prisma.itineraryItem.findUnique({
    where: { id: PILOT_IS_06_ITEM_STOP },
  });
  if (!beforeItem) {
    throw new Error(`Item ${PILOT_IS_06_ITEM_STOP} missing before concurrent accept`);
  }

  const { apply, planVersionStore } = buildPilotWritebackStack(prisma);
  const input = {
    tripId: PILOT_IS_06_TRIP_ID,
    interventionOrOptionId: option.optionId,
    userId: TEP_PILOT_USER_ID,
    basePlanVersionId: PILOT_IS_06_PLAN_VERSION_ID,
  };

  const [a, b] = await Promise.all([
    apply.applyRecoveryOption(input),
    apply.applyRecoveryOption(input),
  ]);

  const afterItem = await prisma.itineraryItem.findUnique({
    where: { id: PILOT_IS_06_ITEM_STOP },
  });
  const block = await planVersionStore.readBlock(PILOT_IS_06_TRIP_ID);
  const prefix = `${PILOT_IS_06_PLAN_VERSION_ID}_tep_`;
  const repairVersions = block.items.filter((v) => v.planVersionId.startsWith(prefix));

  const pass =
    a.planVersionId === b.planVersionId &&
    !afterItem &&
    repairVersions.length === 1 &&
    a.itineraryMaterialized === true;

  const output = {
    ok: pass,
    template: 'PILOT-IS-06',
    tripId: PILOT_IS_06_TRIP_ID,
    optionId: option.optionId,
    planVersionIdA: a.planVersionId,
    planVersionIdB: b.planVersionId,
    repairPlanVersionCount: repairVersions.length,
    itemRemoved: !afterItem,
  };

  if (!pass) {
    throw new Error(`PILOT-IS-06 concurrent smoke failed: ${JSON.stringify(output)}`);
  }
  return output;
}

async function main(): Promise<void> {
  const profile = parseEnvProfile(process.argv);
  loadProjectEnv(profile);
  assertSafeDatabase();
  process.env.RFC001_ITINERARY_MATERIALIZE = '1';

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log(JSON.stringify(await runPilotIs06ConcurrentSmoke(prisma), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
