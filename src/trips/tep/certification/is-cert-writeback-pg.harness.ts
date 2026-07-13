/**
 * WP-TEP-13 — IS-CERT-401/402 Real PostgreSQL writeback harness (opt-in)
 *
 * Run:
 *   TEP_WRITEBACK_PG_E2E=1 DATABASE_URL=postgresql://... npm run test:tep-writeback-pg
 *
 * Refuses production DATABASE_URL. Cleans up seeded rows after each scenario.
 */

import { PrismaClient, type ItemType } from '@prisma/client';
import { loadIsCertRuntimeScenariosFromFile } from './is-cert-runtime.harness';
import { projectDecisionHooks } from '../projectors/decision-hook.projector';
import { projectRecoveryGraph } from '../projectors/recovery-graph.projector';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';
import { buildTepPlanVersionMetadata } from '../contracts/tep-plan-metadata.types';
import {
  buildIsCertWritebackStack,
  type IsCertWritebackResult,
} from './is-cert-writeback.harness';
import { Rfc001ItineraryMaterializerService } from '../../guardian-decision-core/execution/rfc001-itinerary-materializer.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';

export const TEP_PG_WRITEBACK_TRIP_ID = 'tep_pg_wb_cert';
export const TEP_PG_WRITEBACK_DAY_ID = 'tep_pg_wb_cert_day1';
export const TEP_PG_WRITEBACK_ITEM_ID = 'tep_pg_wb_stop';
export const TEP_PG_WRITEBACK_PLAN_VERSION_ID = 'plan_tep_pg_wb_v1';

export function isTepWritebackPgE2eEnabled(): boolean {
  return (
    process.env.TEP_WRITEBACK_PG_E2E === '1' &&
    Boolean(process.env.DATABASE_URL?.trim())
  );
}

export function assertTepWritebackPgE2eAllowed(): void {
  if (!isTepWritebackPgE2eEnabled()) {
    throw new Error(
      'PG E2E disabled — set TEP_WRITEBACK_PG_E2E=1 and DATABASE_URL',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing TEP writeback PG E2E on production DATABASE_URL');
  }
}

export function createTepWritebackPgPrisma(): PrismaClient {
  assertTepWritebackPgE2eAllowed();
  return new PrismaClient();
}

export interface TepPgWritebackFixture {
  tripId: string;
  dayId: string;
  itemId: string;
  planVersionId: string;
  optionId: string;
}

export async function seedTepWritebackPgFixture(
  prisma: PrismaClient,
): Promise<TepPgWritebackFixture> {
  const scenarios = loadIsCertRuntimeScenariosFromFile();
  const scenario = scenarios.find((s) => s.scenarioId === 'IS-CERT-302');
  if (!scenario) {
    throw new Error('IS-CERT-302 scenario not found for PG seed');
  }

  const assessment = validateTepPlanningSnapshot({
    tripId: TEP_PG_WRITEBACK_TRIP_ID,
    countryCode: scenario.input.countryCode,
    profile: scenario.input.profile,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId: TEP_PG_WRITEBACK_TRIP_ID,
    countryCode: scenario.input.countryCode,
    profile: scenario.input.profile,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const pgRecoveryGraph = {
    ...recoveryGraph,
    fallbackOptions: recoveryGraph.fallbackOptions.map((option) => ({
      ...option,
      optionId: option.optionId.replace('activity_stop_1', `activity_${TEP_PG_WRITEBACK_ITEM_ID}`),
      targetRefs: option.targetRefs.map((ref) =>
        ref === 'activity_stop_1' ? `activity_${TEP_PG_WRITEBACK_ITEM_ID}` : ref,
      ),
    })),
  };

  const option = pgRecoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes(`activity_${TEP_PG_WRITEBACK_ITEM_ID}`),
  );
  if (!option) {
    throw new Error('No recovery option for PG seed');
  }

  const hooks = projectDecisionHooks({
    tripId: TEP_PG_WRITEBACK_TRIP_ID,
    countryCode: scenario.input.countryCode,
    dailyDrivePlans: scenario.input.dailyDrivePlans,
    profile: scenario.input.profile,
  });

  const now = new Date();
  const dayDate = new Date('2026-08-05T00:00:00.000Z');

  await cleanupTepWritebackPgFixture(prisma);

  await prisma.trip.create({
    data: {
      id: TEP_PG_WRITEBACK_TRIP_ID,
      destination: 'Iceland',
      startDate: dayDate,
      endDate: new Date('2026-08-12T00:00:00.000Z'),
      updatedAt: now,
      status: 'PLANNING',
      name: 'TEP PG Writeback Cert',
      metadata: toInputJsonValue({
        revision: 1,
        rfc001PlanVersions: {
          items: [
            {
              planVersionId: TEP_PG_WRITEBACK_PLAN_VERSION_ID,
              tripId: TEP_PG_WRITEBACK_TRIP_ID,
              createdBy: 'PLANNER',
              operations: [],
              materializedPlanSnapshotRef: `snap_${TEP_PG_WRITEBACK_PLAN_VERSION_ID}`,
              status: 'EFFECTIVE',
              createdAt: now.toISOString(),
              effectiveAt: now.toISOString(),
              metadata: {
                tep: buildTepPlanVersionMetadata({
                  decisionHooks: hooks,
                  recoveryGraph: pgRecoveryGraph,
                  syncedAt: now.toISOString(),
                }),
              },
            },
          ],
          effectivePlanVersionId: TEP_PG_WRITEBACK_PLAN_VERSION_ID,
        },
      }),
    },
  });

  await prisma.tripDay.create({
    data: {
      id: TEP_PG_WRITEBACK_DAY_ID,
      tripId: TEP_PG_WRITEBACK_TRIP_ID,
      date: dayDate,
    },
  });

  await prisma.itineraryItem.create({
    data: {
      id: TEP_PG_WRITEBACK_ITEM_ID,
      tripDayId: TEP_PG_WRITEBACK_DAY_ID,
      type: 'ACTIVITY' as ItemType,
      order: 1,
      note: 'TEP PG cert optional stop',
    },
  });

  return {
    tripId: TEP_PG_WRITEBACK_TRIP_ID,
    dayId: TEP_PG_WRITEBACK_DAY_ID,
    itemId: TEP_PG_WRITEBACK_ITEM_ID,
    planVersionId: TEP_PG_WRITEBACK_PLAN_VERSION_ID,
    optionId: option.optionId,
  };
}

export async function cleanupTepWritebackPgFixture(prisma: PrismaClient): Promise<void> {
  await prisma.tepRepairExecution.deleteMany({
    where: { tripId: TEP_PG_WRITEBACK_TRIP_ID },
  });
  await prisma.itineraryItem.deleteMany({
    where: { tripDayId: TEP_PG_WRITEBACK_DAY_ID },
  });
  await prisma.tripDay.deleteMany({ where: { tripId: TEP_PG_WRITEBACK_TRIP_ID } });
  await prisma.trip.deleteMany({ where: { id: TEP_PG_WRITEBACK_TRIP_ID } });
}

/** IS-CERT-401 — real PG: apply + idempotent replay */
function countRepairChildPlanVersions(
  items: Array<{ planVersionId: string }>,
  parentPlanVersionId: string,
): number {
  const prefix = `${parentPlanVersionId}_tep_`;
  return items.filter((v) => v.planVersionId.startsWith(prefix)).length;
}

export async function runIsCert401PgScenario(
  prisma: PrismaClient,
): Promise<IsCertWritebackResult> {
  const fixture = await seedTepWritebackPgFixture(prisma);
  const { apply, planVersionStore } = buildIsCertWritebackStack(
    prisma as unknown as PrismaService,
  );

  try {
    const first = await apply.applyRecoveryOption({
      tripId: fixture.tripId,
      interventionOrOptionId: fixture.optionId,
      userId: 'tep_pg_cert_user',
      basePlanVersionId: fixture.planVersionId,
    });

    if (!first.itineraryMaterialized) {
      return {
        scenarioId: 'IS-CERT-401',
        passed: false,
        message: 'First apply did not materialize itinerary',
      };
    }

    const item = await prisma.itineraryItem.findUnique({
      where: { id: fixture.itemId },
    });
    if (item) {
      return {
        scenarioId: 'IS-CERT-401',
        passed: false,
        message: `Itinerary item ${fixture.itemId} still present after first apply`,
      };
    }

    const effectiveAfterFirst = await planVersionStore.getEffectivePlanVersionId(fixture.tripId);
    if (effectiveAfterFirst === fixture.planVersionId) {
      return {
        scenarioId: 'IS-CERT-401',
        passed: false,
        message: 'Effective plan was not promoted after first apply',
      };
    }

    const replay = await apply.applyRecoveryOption({
      tripId: fixture.tripId,
      interventionOrOptionId: fixture.optionId,
      userId: 'tep_pg_cert_user',
    });

    if (!replay.idempotentReplay) {
      return {
        scenarioId: 'IS-CERT-401',
        passed: false,
        message: 'Second apply should be idempotent replay',
      };
    }

    if (replay.planVersionId !== first.planVersionId) {
      return {
        scenarioId: 'IS-CERT-401',
        passed: false,
        message: 'Idempotent replay returned different planVersionId',
      };
    }

    const block = await planVersionStore.readBlock(fixture.tripId);
    const repairVersions = countRepairChildPlanVersions(
      block.items,
      fixture.planVersionId,
    );
    if (repairVersions !== 1) {
      return {
        scenarioId: 'IS-CERT-401',
        passed: false,
        message: `Expected single repair PlanVersion, got ${repairVersions}`,
      };
    }

    return {
      scenarioId: 'IS-CERT-401',
      passed: true,
      artifacts: {
        optionId: fixture.optionId,
        writeback: first,
        effectivePlanVersionId: effectiveAfterFirst,
      },
    };
  } finally {
    await cleanupTepWritebackPgFixture(prisma);
  }
}

/** IS-CERT-402 — real PG: stale basePlanVersionId */
export async function runIsCert402PgScenario(
  prisma: PrismaClient,
): Promise<IsCertWritebackResult> {
  const fixture = await seedTepWritebackPgFixture(prisma);
  const { apply } = buildIsCertWritebackStack(prisma as unknown as PrismaService);

  try {
    try {
      await apply.applyRecoveryOption({
        tripId: fixture.tripId,
        interventionOrOptionId: fixture.optionId,
        userId: 'tep_pg_cert_user',
        basePlanVersionId: 'plan_tep_pg_stale_v5',
      });
      return {
        scenarioId: 'IS-CERT-402',
        passed: false,
        message: 'Expected STALE_REPAIR_OPTION conflict',
      };
    } catch (err: unknown) {
      const resp =
        err && typeof err === 'object' && 'getResponse' in err
          ? (err as { getResponse: () => unknown }).getResponse()
          : undefined;
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : '';
      if (code !== 'STALE_REPAIR_OPTION') {
        const message = err instanceof Error ? err.message : String(err);
        return {
          scenarioId: 'IS-CERT-402',
          passed: false,
          message: `Expected STALE_REPAIR_OPTION, got ${code || message}`,
        };
      }
    }

    const item = await prisma.itineraryItem.findUnique({
      where: { id: fixture.itemId },
    });
    if (!item) {
      return {
        scenarioId: 'IS-CERT-402',
        passed: false,
        message: 'Itinerary item removed despite stale rejection',
      };
    }

    return { scenarioId: 'IS-CERT-402', passed: true };
  } finally {
    await cleanupTepWritebackPgFixture(prisma);
  }
}

/** IS-CERT-401 concurrent — dual accept; one applies, one replays */
export async function runIsCert401ConcurrentPgScenario(
  prisma: PrismaClient,
): Promise<IsCertWritebackResult> {
  const fixture = await seedTepWritebackPgFixture(prisma);
  const { apply, planVersionStore } = buildIsCertWritebackStack(
    prisma as unknown as PrismaService,
  );

  try {
    const input = {
      tripId: fixture.tripId,
      interventionOrOptionId: fixture.optionId,
      userId: 'tep_pg_cert_user',
      basePlanVersionId: fixture.planVersionId,
    };

    const [a, b] = await Promise.all([
      apply.applyRecoveryOption(input),
      apply.applyRecoveryOption(input),
    ]);

    if (a.planVersionId !== b.planVersionId) {
      return {
        scenarioId: 'IS-CERT-401-CONCURRENT',
        passed: false,
        message: 'Concurrent results reference different planVersionId',
      };
    }

    const block = await planVersionStore.readBlock(fixture.tripId);
    const repairVersions = countRepairChildPlanVersions(
      block.items,
      fixture.planVersionId,
    );
    if (repairVersions !== 1) {
      return {
        scenarioId: 'IS-CERT-401-CONCURRENT',
        passed: false,
        message: `Expected single repair PlanVersion under concurrency, got ${repairVersions}`,
      };
    }

    return {
      scenarioId: 'IS-CERT-401-CONCURRENT',
      passed: true,
      artifacts: {
        optionId: fixture.optionId,
        writeback: a,
      },
    };
  } finally {
    await cleanupTepWritebackPgFixture(prisma);
  }
}

/** IS-CERT-403 — real PG: materialization failure rolls back; retry succeeds */
export async function runIsCert403PgScenario(
  prisma: PrismaClient,
): Promise<IsCertWritebackResult> {
  const fixture = await seedTepWritebackPgFixture(prisma);
  const failingMaterializer = {
    applyPlanOperations: async () => {
      throw new Error('simulated materialization failure');
    },
    rollbackMaterialization: async () => ({
      restoredItemIds: [],
      removedSubstituteIds: [],
    }),
  } as unknown as Rfc001ItineraryMaterializerService;

  const { apply, planVersionStore } = buildIsCertWritebackStack(
    prisma as unknown as PrismaService,
    { materializer: failingMaterializer },
  );

  try {
    const effectiveBefore = await planVersionStore.getEffectivePlanVersionId(fixture.tripId);

    try {
      await apply.applyRecoveryOption({
        tripId: fixture.tripId,
        interventionOrOptionId: fixture.optionId,
        userId: 'tep_pg_cert_user',
        basePlanVersionId: fixture.planVersionId,
      });
      return {
        scenarioId: 'IS-CERT-403',
        passed: false,
        message: 'Expected materialization failure',
      };
    } catch {
      // expected
    }

    const effectiveAfterFail = await planVersionStore.getEffectivePlanVersionId(fixture.tripId);
    if (effectiveAfterFail !== effectiveBefore) {
      return {
        scenarioId: 'IS-CERT-403',
        passed: false,
        message: `Effective plan changed after failed apply: ${effectiveBefore} → ${effectiveAfterFail}`,
      };
    }

    const itemAfterFail = await prisma.itineraryItem.findUnique({
      where: { id: fixture.itemId },
    });
    if (!itemAfterFail) {
      return {
        scenarioId: 'IS-CERT-403',
        passed: false,
        message: `Itinerary item ${fixture.itemId} removed despite materialization failure`,
      };
    }

    const { apply: retryApply } = buildIsCertWritebackStack(prisma as unknown as PrismaService);
    const retry = await retryApply.applyRecoveryOption({
      tripId: fixture.tripId,
      interventionOrOptionId: fixture.optionId,
      userId: 'tep_pg_cert_user',
      basePlanVersionId: fixture.planVersionId,
    });

    if (!retry.itineraryMaterialized) {
      return {
        scenarioId: 'IS-CERT-403',
        passed: false,
        message: 'Retry after failure did not materialize',
      };
    }

    const itemAfterRetry = await prisma.itineraryItem.findUnique({
      where: { id: fixture.itemId },
    });
    if (itemAfterRetry) {
      return {
        scenarioId: 'IS-CERT-403',
        passed: false,
        message: `Itinerary item ${fixture.itemId} still present after successful retry`,
      };
    }

    return {
      scenarioId: 'IS-CERT-403',
      passed: true,
      artifacts: {
        optionId: fixture.optionId,
        writeback: retry,
        effectivePlanVersionId: await planVersionStore.getEffectivePlanVersionId(fixture.tripId),
      },
    };
  } finally {
    await cleanupTepWritebackPgFixture(prisma);
  }
}

export function resolvePgCertItemIdFromScenario(): string {
  return TEP_PG_WRITEBACK_ITEM_ID;
}
