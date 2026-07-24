#!/usr/bin/env npx tsx
/**
 * Smoke: PILOT-IS writeback on staging PostgreSQL.
 *
 * Prerequisite:
 *   npm run tep:pilot-seed -- --template=all --reset
 *
 * Usage:
 *   npm run tep:pilot-smoke                    # PILOT-IS-01 REMOVE
 *   npm run tep:pilot-smoke -- --template=03   # PILOT-IS-03 REPLACE
 *   npm run tep:pilot-smoke -- --template=all  # 01 + 03
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { resolveTripDestinationCountry } from '../src/decision-runtime/packs/loader/country-pack-registry.util';
import { projectRecoveryGraph } from '../src/trips/tep/projectors/recovery-graph.projector';
import { resolveSelfDriveProfile } from '../src/trips/tep/resolvers/self-drive-profile.resolver';
import { validateTepPlanningSnapshot } from '../src/trips/tep/validation/tep-validator';
import { resolveItineraryItemIdFromActivityRef } from '../src/trips/tep/utils/tep-repair-intervention.util';
import {
  PILOT_IS_01_ITEM_STOP,
  PILOT_IS_01_PLAN_VERSION_ID,
  PILOT_IS_01_TRIP_ID,
  PILOT_IS_03_FALLBACK_POI,
  PILOT_IS_03_ITEM_COASTAL,
  PILOT_IS_03_PLAN_VERSION_ID,
  PILOT_IS_03_TRIP_ID,
  TEP_PILOT_USER_ID,
} from './tep-pilot-is-seed.constants';
import {
  assertSafeDatabase,
  buildPilotWritebackStack,
  loadProjectEnv,
  parseEnvProfile,
  parseSmokeTemplate,
  projectDailyDrivePlansForTrip,
  readSeededRecoveryGraph,
  type TepPilotSmokeTemplate,
} from './tep-pilot-smoke.util';

export async function runPilotIs01RemoveSmoke(prisma: PrismaClient): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: PILOT_IS_01_TRIP_ID },
    select: { id: true, destination: true, metadata: true, pacingConfig: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${PILOT_IS_01_TRIP_ID} not found — run: npm run tep:pilot-seed -- --template=01 --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const countryCode = resolveTripDestinationCountry(trip.destination) ?? 'IS';
  const profile = resolveSelfDriveProfile({
    tripId: PILOT_IS_01_TRIP_ID,
    explorationInput: undefined,
    tripPacingConfig: trip.pacingConfig,
    tripMetadata: metadata,
    destinationCountry: countryCode,
  });

  const dailyDrivePlans = await projectDailyDrivePlansForTrip(prisma, PILOT_IS_01_TRIP_ID);
  const assessment = validateTepPlanningSnapshot({
    tripId: PILOT_IS_01_TRIP_ID,
    countryCode,
    profile,
    dailyDrivePlans,
  });

  if (assessment.status !== 'REQUIRES_REPAIR') {
    throw new Error(
      `Expected REQUIRES_REPAIR for ${PILOT_IS_01_TRIP_ID}, got ${assessment.status}`,
    );
  }

  const recoveryGraph =
    readSeededRecoveryGraph(metadata) ??
    projectRecoveryGraph({
      tripId: PILOT_IS_01_TRIP_ID,
      countryCode,
      profile,
      dailyDrivePlans,
      ruleResults: assessment.ruleResults,
    });

  const option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes('activity_stop_1'),
  );
  if (!option) {
    throw new Error(
      `No REMOVE option for activity_stop_1 (options: ${recoveryGraph.fallbackOptions.map((o) => o.optionId).join(', ') || 'none'})`,
    );
  }

  const itemId = resolveItineraryItemIdFromActivityRef('activity_stop_1');
  if (itemId !== PILOT_IS_01_ITEM_STOP) {
    throw new Error(`Unexpected item mapping: ${itemId}`);
  }

  const beforeItem = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!beforeItem) {
    throw new Error(`Item ${itemId} missing before accept`);
  }

  const { apply, planVersionStore } = buildPilotWritebackStack(prisma);
  const planBefore = await planVersionStore.getEffectivePlanVersionId(PILOT_IS_01_TRIP_ID);
  if (planBefore !== PILOT_IS_01_PLAN_VERSION_ID) {
    throw new Error(`Unexpected effective plan before accept: ${planBefore}`);
  }

  const writeback = await apply.applyRecoveryOption({
    tripId: PILOT_IS_01_TRIP_ID,
    interventionOrOptionId: option.optionId,
    userId: TEP_PILOT_USER_ID,
    basePlanVersionId: PILOT_IS_01_PLAN_VERSION_ID,
  });

  const afterItem = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  const planAfter = await planVersionStore.getEffectivePlanVersionId(PILOT_IS_01_TRIP_ID);

  const pass =
    writeback.itineraryMaterialized === true &&
    !afterItem &&
    planAfter !== planBefore &&
    planAfter !== PILOT_IS_01_PLAN_VERSION_ID;

  const result = {
    ok: pass,
    template: 'PILOT-IS-01',
    tripId: PILOT_IS_01_TRIP_ID,
    assessmentStatus: assessment.status,
    optionId: option.optionId,
    removedItemId: itemId,
    planBefore,
    planAfter,
    writeback: {
      appliedOptionId: writeback.appliedOptionId,
      appliedAction: writeback.appliedAction,
      itineraryMaterialized: writeback.itineraryMaterialized,
      removedItemIds: writeback.removedItemIds,
    },
  };

  if (!pass) {
    throw new Error(`PILOT-IS-01 accept smoke failed: ${JSON.stringify(result)}`);
  }
  return result;
}

export async function runPilotIs03ReplaceSmoke(prisma: PrismaClient): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: PILOT_IS_03_TRIP_ID },
    select: { id: true, destination: true, metadata: true, pacingConfig: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${PILOT_IS_03_TRIP_ID} not found — run: npm run tep:pilot-seed -- --template=03 --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const recoveryGraph = readSeededRecoveryGraph(metadata);
  if (!recoveryGraph?.fallbackOptions.length) {
    throw new Error(`No seeded recoveryGraph on ${PILOT_IS_03_TRIP_ID}`);
  }

  const option = recoveryGraph.fallbackOptions.find(
    (o) =>
      o.action === 'REPLACE' &&
      o.targetRefs.includes('activity_coastal_walk') &&
      o.replacementPoiId === PILOT_IS_03_FALLBACK_POI,
  );
  if (!option) {
    throw new Error(
      `No REPLACE option for activity_coastal_walk (options: ${recoveryGraph.fallbackOptions.map((o) => o.optionId).join(', ')})`,
    );
  }

  const beforeItem = await prisma.itineraryItem.findUnique({
    where: { id: PILOT_IS_03_ITEM_COASTAL },
  });
  if (!beforeItem) {
    throw new Error(`Item ${PILOT_IS_03_ITEM_COASTAL} missing before accept`);
  }

  const itemCountBefore = await prisma.itineraryItem.count({
    where: { TripDay: { tripId: PILOT_IS_03_TRIP_ID } },
  });

  const { apply, planVersionStore } = buildPilotWritebackStack(prisma);
  const planBefore = await planVersionStore.getEffectivePlanVersionId(PILOT_IS_03_TRIP_ID);
  if (planBefore !== PILOT_IS_03_PLAN_VERSION_ID) {
    throw new Error(`Unexpected effective plan before accept: ${planBefore}`);
  }

  const writeback = await apply.applyRecoveryOption({
    tripId: PILOT_IS_03_TRIP_ID,
    interventionOrOptionId: option.optionId,
    userId: TEP_PILOT_USER_ID,
    basePlanVersionId: PILOT_IS_03_PLAN_VERSION_ID,
  });

  const afterCoastal = await prisma.itineraryItem.findUnique({
    where: { id: PILOT_IS_03_ITEM_COASTAL },
  });
  const itemCountAfter = await prisma.itineraryItem.count({
    where: { TripDay: { tripId: PILOT_IS_03_TRIP_ID } },
  });
  const planAfter = await planVersionStore.getEffectivePlanVersionId(PILOT_IS_03_TRIP_ID);

  const pass =
    writeback.itineraryMaterialized === true &&
    writeback.appliedAction === 'REPLACE' &&
    writeback.replacementPoiId === PILOT_IS_03_FALLBACK_POI &&
    !afterCoastal &&
    itemCountAfter >= itemCountBefore &&
    (writeback.createdItemIds?.length ?? 0) >= 1 &&
    planAfter !== planBefore &&
    planAfter !== PILOT_IS_03_PLAN_VERSION_ID;

  const result = {
    ok: pass,
    template: 'PILOT-IS-03',
    tripId: PILOT_IS_03_TRIP_ID,
    optionId: option.optionId,
    removedItemId: PILOT_IS_03_ITEM_COASTAL,
    planBefore,
    planAfter,
    writeback: {
      appliedOptionId: writeback.appliedOptionId,
      appliedAction: writeback.appliedAction,
      replacementPoiId: writeback.replacementPoiId,
      itineraryMaterialized: writeback.itineraryMaterialized,
      removedItemIds: writeback.removedItemIds,
      createdItemIds: writeback.createdItemIds,
    },
  };

  if (!pass) {
    throw new Error(`PILOT-IS-03 REPLACE smoke failed: ${JSON.stringify(result)}`);
  }
  return result;
}

export async function runPilotSmoke(
  prisma: PrismaClient,
  template: TepPilotSmokeTemplate,
): Promise<Record<string, unknown>> {
  if (template === '01') {
    return runPilotIs01RemoveSmoke(prisma);
  }
  if (template === '03') {
    return runPilotIs03ReplaceSmoke(prisma);
  }

  const results = {
    ok: true,
    templates: [
      await runPilotIs01RemoveSmoke(prisma),
      await runPilotIs03ReplaceSmoke(prisma),
    ],
  };
  return results;
}

async function main(): Promise<void> {
  const profile = parseEnvProfile(process.argv);
  loadProjectEnv(profile);
  assertSafeDatabase();

  const template = parseSmokeTemplate(process.argv);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const result = await runPilotSmoke(prisma, template);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
