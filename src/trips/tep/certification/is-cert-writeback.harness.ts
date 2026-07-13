/**
 * IS-CERT writeback integration harness — RecoveryOption → PlanVersion → itinerary (mock DB)
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §8 / WP-TEP-12
 */

import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { Rfc001ItineraryMaterializerService } from '../../guardian-decision-core/execution/rfc001-itinerary-materializer.service';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import type {
  DecisionHook,
  RecoveryGraph,
  RecoveryOption,
} from '../contracts/tep-self-drive.types';
import { projectDecisionHooks } from '../projectors/decision-hook.projector';
import {
  applyRemoveActivity,
  projectRecoveryGraph,
  simulateLocalRepair,
} from '../projectors/recovery-graph.projector';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';
import type { IsCertRuntimeScenario } from './is-cert-runtime.harness';
import { TepLocalRepairApplyService, type TepLocalRepairApplyResult } from '../services/tep-local-repair-apply.service';
import { TepPlanMetadataService } from '../services/tep-plan-metadata.service';
import { TepRepairExecutionStore } from '../services/tep-repair-execution.store';
import { resolveItineraryItemIdFromActivityRef } from '../utils/tep-repair-intervention.util';
import { TepExecutionSlipDaylightBridgeService } from '../services/tep-execution-slip-daylight.bridge';
import type { TepRuntimePipelineBridgeService } from '../services/tep-runtime-pipeline.bridge';
import {
  buildExecutionSlipDaylightArrivals,
  computeDaylightViolationMinutes,
} from '../utils/daylight-violation-minutes.util';

export interface IsCertWritebackResult {
  scenarioId: string;
  passed: boolean;
  message?: string;
  artifacts?: {
    optionId: string;
    writeback: TepLocalRepairApplyResult;
    effectivePlanVersionId?: string;
  };
}

export interface IsCertWritebackMockState {
  tripId: string;
  items: Map<string, Record<string, unknown>>;
  tripMeta: Record<string, unknown>;
}

export function createIsCertWritebackMockPrisma(input: {
  tripId: string;
  itemIds: string[];
  planVersionId: string;
  recoveryGraph: RecoveryGraph;
  decisionHooks?: DecisionHook[];
}): { prisma: PrismaService; state: IsCertWritebackMockState } {
  const items = new Map<string, Record<string, unknown>>();
  const tripDayId = 'day_cert_writeback';

  for (const itemId of input.itemIds) {
    items.set(itemId, {
      id: itemId,
      tripDayId,
      type: 'ACTIVITY',
      order: 1,
      note: `cert item ${itemId}`,
    });
  }

  const tripMeta: Record<string, unknown> = {
    revision: 5,
    rfc001PlanVersions: {
      items: [
        {
          planVersionId: input.planVersionId,
          tripId: input.tripId,
          createdBy: 'PLANNER',
          operations: [],
          materializedPlanSnapshotRef: `snap_${input.planVersionId}`,
          status: 'EFFECTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
          effectiveAt: '2026-08-01T00:00:00.000Z',
          metadata: {
            tep: {
              schemaId: 'tripnara/tep_plan_version_metadata@v1',
              decisionHooks: input.decisionHooks ?? [],
              recoveryGraph: input.recoveryGraph,
              syncedAt: '2026-08-01T00:00:00.000Z',
            },
          },
        },
      ],
      effectivePlanVersionId: input.planVersionId,
    },
  };

  const state: IsCertWritebackMockState = {
    tripId: input.tripId,
    items,
    tripMeta,
  };

  const repairExecutions = new Map<
    string,
    {
      idempotencyKey: string;
      status: 'PENDING' | 'APPLIED' | 'FAILED';
      planVersionId: string | null;
      decisionId: string | null;
      createdAt: Date;
    }
  >();

  const mockTx = {
    $executeRaw: jest.fn(async () => undefined),
    tepRepairExecution: {
      findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        repairExecutions.get(where.idempotencyKey) ?? null,
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { idempotencyKey: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = repairExecutions.get(where.idempotencyKey);
          const row = existing
            ? {
                ...existing,
                status: (update.status as 'PENDING') ?? existing.status,
                planVersionId: (update.planVersionId as string | null) ?? existing.planVersionId,
                decisionId: (update.decisionId as string | null) ?? existing.decisionId,
              }
            : {
                idempotencyKey: where.idempotencyKey,
                status: create.status as 'PENDING',
                planVersionId: null,
                decisionId: null,
                createdAt: new Date(),
              };
          repairExecutions.set(where.idempotencyKey, row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { idempotencyKey: string };
          data: Record<string, unknown>;
        }) => {
          const existing = repairExecutions.get(where.idempotencyKey);
          if (!existing) throw new Error('not found');
          const row = { ...existing, ...data } as (typeof repairExecutions extends Map<string, infer V> ? V : never);
          repairExecutions.set(where.idempotencyKey, row);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { idempotencyKey: string; status: string };
          data: Record<string, unknown>;
        }) => {
          const existing = repairExecutions.get(where.idempotencyKey);
          if (!existing || existing.status !== where.status) return { count: 0 };
          repairExecutions.set(where.idempotencyKey, { ...existing, ...data } as typeof existing);
          return { count: 1 };
        },
      ),
    },
  };

  const prisma = {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
        if (args.where.id !== input.tripId) return null;
        return {
          id: input.tripId,
          metadata: state.tripMeta,
          updatedAt: new Date(),
          destination: 'Iceland',
          pacingConfig: null,
        };
      }),
      update: jest.fn(async ({ data }: { data: { metadata?: unknown } }) => {
        if (data.metadata) {
          Object.assign(state.tripMeta, data.metadata as object);
        }
        return { metadata: state.tripMeta };
      }),
    },
    itineraryItem: {
      findMany: jest.fn(async (args: {
        where: { id?: { in: string[] }; TripDay?: { tripId: string } };
      }) => {
        const ids = args.where.id?.in ?? [...state.items.keys()];
        return ids
          .filter((id) => state.items.has(id))
          .map((id) => ({
            id,
            tripDayId,
            TripDay: { tripId: input.tripId },
          }));
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        state.items.get(where.id) ?? null,
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = state.items.get(where.id);
        state.items.delete(where.id);
        return row ?? { id: where.id };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          ...data,
          id: String(data.id),
          tripDayId: String(data.tripDayId ?? tripDayId),
        };
        state.items.set(row.id, row);
        return row;
      }),
    },
    tripDay: {
      findMany: jest.fn(async () => [{ id: tripDayId, tripId: input.tripId, date: new Date() }]),
      findUnique: jest.fn(async () => ({ id: tripDayId, tripId: input.tripId, date: new Date() })),
    },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaService;

  return { prisma, state };
}

export function buildIsCertWritebackStack(
  prisma: PrismaService,
  overrides?: {
    materializer?: Rfc001ItineraryMaterializerService;
    executability?: import('../services/executability-assessment.service').ExecutabilityAssessmentService;
  },
): {
  apply: TepLocalRepairApplyService;
  planVersionStore: Rfc001PlanVersionStoreService;
  materializer: Rfc001ItineraryMaterializerService;
} {
  const writeGuard = new EffectivePlanWriteGuardService();
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma, writeGuard);
  const planMetadata = new TepPlanMetadataService(prisma, planVersionStore);
  const materializer =
    overrides?.materializer ?? new Rfc001ItineraryMaterializerService(prisma, writeGuard);
  const executability =
    overrides?.executability ??
    ({
      getExecutability: jest.fn(async (tripId: string) => ({
        tripId,
        hooksPersisted: true,
      })),
    } as unknown as import('../services/executability-assessment.service').ExecutabilityAssessmentService);

  const apply = new TepLocalRepairApplyService(
    prisma,
    planVersionStore,
    planMetadata,
    materializer,
    writeGuard,
    executability,
    new TepRepairExecutionStore(),
  );

  return { apply, planVersionStore, materializer };
}

/** IS-CERT-302 — real Local Repair writeback with in-memory Prisma */
export async function runIsCertWritebackScenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  if (expect.statusBefore && assessment.status !== expect.statusBefore) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected status ${expect.statusBefore}, got ${assessment.status}`,
    };
  }

  const recoveryGraph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes(expect.repairTargetRef ?? ''),
  );
  if (!option) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `No repair option for ${expect.repairTargetRef}`,
    };
  }

  const targetRef = expect.repairTargetRef ?? option.targetRefs[0]!;
  const itemId = resolveItineraryItemIdFromActivityRef(targetRef);
  if (!itemId) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Cannot resolve itinerary item from ref ${targetRef}`,
    };
  }

  const hooks = projectDecisionHooks({
    tripId: input.tripId,
    countryCode: input.countryCode,
    dailyDrivePlans: input.dailyDrivePlans,
    profile: input.profile,
  });

  const { prisma, state } = createIsCertWritebackMockPrisma({
    tripId: input.tripId,
    itemIds: [itemId],
    planVersionId: input.planVersionId,
    recoveryGraph,
    decisionHooks: hooks,
  });

  const { apply, planVersionStore } = buildIsCertWritebackStack(prisma);

  const writeback = await apply.applyRecoveryOption({
    tripId: input.tripId,
    interventionOrOptionId: option.optionId,
    userId: 'cert_user',
  });

  if (!writeback.itineraryMaterialized) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'Itinerary materialization did not apply',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  if (state.items.has(itemId)) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Itinerary item ${itemId} still present after writeback`,
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  const effectiveId = await planVersionStore.getEffectivePlanVersionId(input.tripId);
  const effective = effectiveId ? await planVersionStore.get(input.tripId, effectiveId) : undefined;

  if (!effective || effective.planVersionId === input.planVersionId) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'Effective PlanVersion was not promoted to child repair version',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  const tepMeta = (effective.metadata as Record<string, unknown> | undefined)?.tep as
    | Record<string, unknown>
    | undefined;
  if (tepMeta?.recoveryGraphApplied !== option.optionId) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `metadata.tep.recoveryGraphApplied expected ${option.optionId}`,
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  const replay = await apply.applyRecoveryOption({
    tripId: input.tripId,
    interventionOrOptionId: option.optionId,
    userId: 'cert_user',
  });
  if (!replay.idempotentReplay) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'Second apply should be idempotent replay',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  return {
    scenarioId: scenario.scenarioId,
    passed: true,
    artifacts: {
      optionId: option.optionId,
      writeback,
      effectivePlanVersionId: effective.planVersionId,
    },
  };
}

/** IS-CERT-401 — idempotent writeback (alias of 302 replay semantics) */
export async function runIsCert401Scenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const base = await runIsCertWritebackScenario(scenario);
  if (!base.passed) return { ...base, scenarioId: 'IS-CERT-401' };
  return { ...base, scenarioId: 'IS-CERT-401' };
}

/** IS-CERT-401-CONCURRENT — dual parallel accept coalesces to single apply (mock DB) */
export async function runIsCert401ConcurrentScenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes(expect.repairTargetRef ?? ''),
  );
  if (!option) {
    return {
      scenarioId: 'IS-CERT-401-CONCURRENT',
      passed: false,
      message: `No repair option for ${expect.repairTargetRef}`,
    };
  }

  const targetRef = expect.repairTargetRef ?? option.targetRefs[0]!;
  const itemId = resolveItineraryItemIdFromActivityRef(targetRef);
  if (!itemId) {
    return {
      scenarioId: 'IS-CERT-401-CONCURRENT',
      passed: false,
      message: `Cannot resolve itinerary item from ref ${targetRef}`,
    };
  }

  const hooks = projectDecisionHooks({
    tripId: input.tripId,
    countryCode: input.countryCode,
    dailyDrivePlans: input.dailyDrivePlans,
    profile: input.profile,
  });

  const { prisma, state } = createIsCertWritebackMockPrisma({
    tripId: input.tripId,
    itemIds: [itemId],
    planVersionId: input.planVersionId,
    recoveryGraph,
    decisionHooks: hooks,
  });

  const { apply, planVersionStore } = buildIsCertWritebackStack(prisma);

  const inputApply = {
    tripId: input.tripId,
    interventionOrOptionId: option.optionId,
    userId: 'cert_user',
    basePlanVersionId: input.planVersionId,
  };

  const [a, b] = await Promise.all([
    apply.applyRecoveryOption(inputApply),
    apply.applyRecoveryOption(inputApply),
  ]);

  if (a.planVersionId !== b.planVersionId) {
    return {
      scenarioId: 'IS-CERT-401-CONCURRENT',
      passed: false,
      message: 'Concurrent results reference different planVersionId',
    };
  }

  if (state.items.has(itemId)) {
    return {
      scenarioId: 'IS-CERT-401-CONCURRENT',
      passed: false,
      message: `Itinerary item ${itemId} still present after concurrent apply`,
    };
  }

  const block = await planVersionStore.readBlock(input.tripId);
  const prefix = `${input.planVersionId}_tep_`;
  const repairVersions = block.items.filter((v) => v.planVersionId.startsWith(prefix));
  if (repairVersions.length !== 1) {
    return {
      scenarioId: 'IS-CERT-401-CONCURRENT',
      passed: false,
      message: `Expected single repair PlanVersion under concurrency, got ${repairVersions.length}`,
    };
  }

  return {
    scenarioId: 'IS-CERT-401-CONCURRENT',
    passed: true,
    artifacts: {
      optionId: option.optionId,
      writeback: a,
      effectivePlanVersionId: repairVersions[0]?.planVersionId,
    },
  };
}

/** IS-CERT-402 — stale basePlanVersionId → STALE_REPAIR_OPTION */
export async function runIsCert402Scenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes(expect.repairTargetRef ?? ''),
  );
  if (!option) {
    return {
      scenarioId: 'IS-CERT-402',
      passed: false,
      message: `No repair option for ${expect.repairTargetRef}`,
    };
  }

  const staleBasePlanVersionId = expect.staleBasePlanVersionId ?? 'plan_cert_stale_v5';
  const currentPlanVersionId = input.planVersionId;

  const { prisma } = createIsCertWritebackMockPrisma({
    tripId: input.tripId,
    itemIds: [],
    planVersionId: currentPlanVersionId,
    recoveryGraph,
  });

  const { apply } = buildIsCertWritebackStack(prisma);

  try {
    await apply.applyRecoveryOption({
      tripId: input.tripId,
      interventionOrOptionId: option.optionId,
      userId: 'cert_user',
      basePlanVersionId: staleBasePlanVersionId,
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

  return { scenarioId: 'IS-CERT-402', passed: true };
}

/** IS-CERT-403 — materialization failure rolls back; effective unchanged; retryable */
export async function runIsCert403Scenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes(expect.repairTargetRef ?? ''),
  );
  if (!option) {
    return {
      scenarioId: 'IS-CERT-403',
      passed: false,
      message: `No repair option for ${expect.repairTargetRef}`,
    };
  }

  const targetRef = expect.repairTargetRef ?? option.targetRefs[0]!;
  const itemId = resolveItineraryItemIdFromActivityRef(targetRef);
  if (!itemId) {
    return {
      scenarioId: 'IS-CERT-403',
      passed: false,
      message: `Cannot resolve itinerary item from ref ${targetRef}`,
    };
  }

  const { prisma, state } = createIsCertWritebackMockPrisma({
    tripId: input.tripId,
    itemIds: [itemId],
    planVersionId: input.planVersionId,
    recoveryGraph,
  });

  const writeGuard = new EffectivePlanWriteGuardService();
  const failingMaterializer = {
    applyPlanOperations: jest.fn(async () => {
      throw new Error('simulated materialization failure');
    }),
    rollbackMaterialization: jest.fn(async () => ({
      restoredItemIds: [],
      removedSubstituteIds: [],
    })),
  } as unknown as Rfc001ItineraryMaterializerService;

  const { apply, planVersionStore } = buildIsCertWritebackStack(prisma, {
    materializer: failingMaterializer,
  });

  const effectiveBefore = await planVersionStore.getEffectivePlanVersionId(input.tripId);

  try {
    await apply.applyRecoveryOption({
      tripId: input.tripId,
      interventionOrOptionId: option.optionId,
      userId: 'cert_user',
    });
    return {
      scenarioId: 'IS-CERT-403',
      passed: false,
      message: 'Expected materialization failure',
    };
  } catch {
    // expected
  }

  const effectiveAfterFail = await planVersionStore.getEffectivePlanVersionId(input.tripId);
  if (effectiveAfterFail !== effectiveBefore) {
    return {
      scenarioId: 'IS-CERT-403',
      passed: false,
      message: `Effective plan changed after failed apply: ${effectiveBefore} → ${effectiveAfterFail}`,
    };
  }

  if (!state.items.has(itemId)) {
    return {
      scenarioId: 'IS-CERT-403',
      passed: false,
      message: `Itinerary item ${itemId} removed despite materialization failure`,
    };
  }

  const { apply: retryApply } = buildIsCertWritebackStack(prisma);
  const retry = await retryApply.applyRecoveryOption({
    tripId: input.tripId,
    interventionOrOptionId: option.optionId,
    userId: 'cert_user',
  });

  if (!retry.itineraryMaterialized) {
    return {
      scenarioId: 'IS-CERT-403',
      passed: false,
      message: 'Retry after failure did not materialize',
    };
  }

  return {
    scenarioId: 'IS-CERT-403',
    passed: true,
    artifacts: {
      optionId: option.optionId,
      writeback: retry,
      effectivePlanVersionId: await planVersionStore.getEffectivePlanVersionId(input.tripId),
    },
  };
}

/** IS-CERT-303 — REPLACE writeback with precomputed replacementPoiId (WP-TEP-14) */
export async function runIsCert303ReplaceWritebackScenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  const recoveryGraph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const option = recoveryGraph.fallbackOptions.find(
    (o) =>
      o.triggerRuleId === expect.fallbackTriggerRuleId &&
      o.targetRefs.includes(expect.fallbackTargetRef ?? ''),
  );

  if (!option) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: `No REPLACE fallback for ${expect.fallbackTargetRef}`,
    };
  }

  if (option.action !== 'REPLACE' || !option.replacementPoiId) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: `Expected REPLACE with replacementPoiId, got ${option.action}`,
    };
  }

  const targetRef = expect.fallbackTargetRef ?? option.targetRefs[0]!;
  const itemId = resolveItineraryItemIdFromActivityRef(targetRef);
  if (!itemId) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: `Cannot resolve itinerary item from ref ${targetRef}`,
    };
  }

  const hooks = projectDecisionHooks({
    tripId: input.tripId,
    countryCode: input.countryCode,
    dailyDrivePlans: input.dailyDrivePlans,
    profile: input.profile,
  });

  const { prisma, state } = createIsCertWritebackMockPrisma({
    tripId: input.tripId,
    itemIds: [itemId],
    planVersionId: input.planVersionId,
    recoveryGraph,
    decisionHooks: hooks,
  });

  const { apply, planVersionStore } = buildIsCertWritebackStack(prisma);

  const writeback = await apply.applyRecoveryOption({
    tripId: input.tripId,
    interventionOrOptionId: option.optionId,
    userId: 'cert_user',
  });

  if (!writeback.itineraryMaterialized) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: 'REPLACE writeback did not materialize',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  if (writeback.appliedAction !== 'REPLACE') {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: `Expected appliedAction REPLACE, got ${writeback.appliedAction}`,
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  if (state.items.has(itemId)) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: `Original item ${itemId} still present after REPLACE`,
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  const substituteCount = [...state.items.keys()].filter((id) => id !== itemId).length;
  if (substituteCount < 1) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: 'No substitute itinerary item created after REPLACE',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  const effectiveId = await planVersionStore.getEffectivePlanVersionId(input.tripId);
  const effective = effectiveId ? await planVersionStore.get(input.tripId, effectiveId) : undefined;
  if (!effective || effective.planVersionId === input.planVersionId) {
    return {
      scenarioId: 'IS-CERT-303',
      passed: false,
      message: 'Effective PlanVersion was not promoted after REPLACE',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  return {
    scenarioId: 'IS-CERT-303',
    passed: true,
    artifacts: {
      optionId: option.optionId,
      writeback,
      effectivePlanVersionId: effective.planVersionId,
    },
  };
}

function buildIsCert405DaylightRemoveOption(
  targetRef: string,
  dayIndex: number,
): RecoveryOption {
  return {
    optionId: `REPAIR-SDR202-D${dayIndex}-${targetRef}`,
    triggerRuleId: 'SDR-202',
    action: 'REMOVE',
    targetRefs: [targetRef, `day_${dayIndex}`],
    description: '删除可选停靠以回收日照窗口（执行 slip 后）',
  };
}

/** IS-CERT-405 — slip → daylight hook → REMOVE writeback → daylight restored */
export async function runIsCert405Scenario(
  scenario: IsCertRuntimeScenario,
): Promise<IsCertWritebackResult> {
  const { input, expect } = scenario;
  const slip = input.executionSlip;
  if (!slip) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'Missing input.executionSlip',
    };
  }

  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  if (expect.statusBefore && assessment.status !== expect.statusBefore) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Expected status ${expect.statusBefore}, got ${assessment.status}`,
    };
  }

  const baselineDusk = computeDaylightViolationMinutes({
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });
  const slipArrivals = buildExecutionSlipDaylightArrivals({
    dailyDrivePlans: input.dailyDrivePlans,
    dayIndex: input.dailyDrivePlans[0]?.dayIndex ?? 1,
    slipMinutes: slip.slipMinutes,
    nextActivityId: slip.nextActivityId,
    projectedEta: slip.observedAt,
  });
  const afterSlipDusk = computeDaylightViolationMinutes({
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    activityArrivals: slipArrivals,
  });

  if (afterSlipDusk.driveMinutesAfterCivilDusk <= baselineDusk.driveMinutesAfterCivilDusk) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'Execution slip did not increase driveMinutesAfterCivilDusk',
    };
  }

  const slipMin = expect.slipDriveMinutesAfterCivilDuskMin ?? 1;
  if (afterSlipDusk.driveMinutesAfterCivilDusk < slipMin) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Expected slip dusk >= ${slipMin}, got ${afterSlipDusk.driveMinutesAfterCivilDusk}`,
    };
  }

  const pipelineBridge = {
    tryTriggerFromDaylightScheduleRisk: jest.fn(async () => ({
      matched: true,
      transitioned: true,
      hook: { hookId: 'HOOK-DAYLIGHT-D1-1' },
      problem: { problemId: 'problem_tep_slip_cert_405' },
    })),
  } as unknown as TepRuntimePipelineBridgeService;

  const executability = {
    getExecutability: jest.fn(async () => ({
      tripId: input.tripId,
      assessment: { packId: 'destination.is' },
      profile: input.profile,
      dailyDrivePlans: input.dailyDrivePlans,
      worldStateEvidence: { activityArrivals: [] },
    })),
  } as unknown as import('../services/executability-assessment.service').ExecutabilityAssessmentService;

  const slipBridge = new TepExecutionSlipDaylightBridgeService(executability, pipelineBridge);
  const slipTrigger = await slipBridge.tryTriggerFromExecutionSlip({
    tripId: input.tripId,
    observation: {
      observationId: 'obs_cert_405',
      tripId: input.tripId,
      planVersionId: input.planVersionId,
      activityId: slip.currentActivityId,
      plannedDepartAt: slip.plannedDepartAt,
      observedAt: slip.observedAt,
      stillAtPoi: true,
      source: 'USER_REPORT',
      recordedBy: 'cert_user',
      recordedAt: slip.observedAt,
    },
    impact: {
      tripId: input.tripId,
      currentActivityId: slip.currentActivityId,
      nextActivityId: slip.nextActivityId,
      affectedPlanItemIds: [slip.currentActivityId, slip.nextActivityId],
      affectedEntityRefs: [],
      assessment: {
        result: 'AT_RISK',
        projectedEta: slip.observedAt,
        slipMinutes: slip.slipMinutes,
        gate: 'NEED_CONFIRM',
        reasonCodes: [],
        infeasible: false,
      },
      nextWindow: null,
      travelDurationMinutes: 90,
      shortenDeltaMinutes: 40,
    },
    triggerEventId: slip.triggerEventId ?? 'evt_slip_cert_405',
    worldStateSnapshotId: slip.worldStateSnapshotId ?? 'ws_cert_405',
  });

  if (!slipTrigger?.matched) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'TepExecutionSlipDaylightBridge did not match daylight hook',
    };
  }

  const duskCall = (pipelineBridge.tryTriggerFromDaylightScheduleRisk as jest.Mock).mock
    .calls[0]?.[0];
  if (
    !duskCall ||
    duskCall.driveMinutesAfterCivilDusk <= duskCall.previousDriveMinutesAfterCivilDusk
  ) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'Daylight hook trigger did not record increased dusk violation',
    };
  }

  if (expect.hookPrefix && !String(slipTrigger.hook?.hookId ?? '').startsWith(expect.hookPrefix)) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Expected hook prefix ${expect.hookPrefix}`,
    };
  }

  const targetRef = expect.repairTargetRef ?? 'activity_stop_405';
  const dayIndex = input.dailyDrivePlans[0]?.dayIndex ?? 1;

  let recoveryGraph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  let option = recoveryGraph.fallbackOptions.find((o) =>
    o.targetRefs.includes(targetRef),
  );
  if (!option) {
    option = buildIsCert405DaylightRemoveOption(targetRef, dayIndex);
    recoveryGraph = {
      ...recoveryGraph,
      fallbackOptions: [...recoveryGraph.fallbackOptions, option],
    };
  }

  const preview = simulateLocalRepair({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    option,
    statusBefore: assessment.status,
  });
  if (!preview) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'Daylight REMOVE repair preview failed',
    };
  }

  const repairedPlans = applyRemoveActivity(
    input.dailyDrivePlans,
    targetRef,
    input.countryCode,
  );
  const repairedAssessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: repairedPlans,
  });
  const repairedDusk = computeDaylightViolationMinutes({
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: repairedPlans,
  });

  const expectedDuskAfter = expect.driveMinutesAfterCivilDuskAfterRepair ?? 0;
  if (repairedDusk.driveMinutesAfterCivilDusk !== expectedDuskAfter) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Expected repaired dusk ${expectedDuskAfter}, got ${repairedDusk.driveMinutesAfterCivilDusk}`,
    };
  }

  if (repairedAssessment.status === 'REQUIRES_REPAIR') {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Repaired plan still REQUIRES_REPAIR`,
    };
  }

  if (repairedAssessment.ruleResults.some((r) => r.ruleId === 'SDR-202')) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'SDR-202 still present after daylight REMOVE repair',
    };
  }

  const itemId = resolveItineraryItemIdFromActivityRef(targetRef);
  if (!itemId) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Cannot resolve itinerary item from ref ${targetRef}`,
    };
  }

  const hooks = projectDecisionHooks({
    tripId: input.tripId,
    countryCode: input.countryCode,
    dailyDrivePlans: input.dailyDrivePlans,
    profile: input.profile,
  });

  const { prisma, state } = createIsCertWritebackMockPrisma({
    tripId: input.tripId,
    itemIds: [itemId],
    planVersionId: input.planVersionId,
    recoveryGraph,
    decisionHooks: hooks,
  });

  const { apply, planVersionStore } = buildIsCertWritebackStack(prisma);

  const writeback = await apply.applyRecoveryOption({
    tripId: input.tripId,
    interventionOrOptionId: option.optionId,
    userId: 'cert_user',
  });

  if (!writeback.itineraryMaterialized) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'Itinerary materialization did not apply',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  if (state.items.has(itemId)) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: `Itinerary item ${itemId} still present after writeback`,
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  const effectiveId = await planVersionStore.getEffectivePlanVersionId(input.tripId);
  const effective = effectiveId ? await planVersionStore.get(input.tripId, effectiveId) : undefined;
  if (!effective || effective.planVersionId === input.planVersionId) {
    return {
      scenarioId: 'IS-CERT-405',
      passed: false,
      message: 'Effective PlanVersion was not promoted after daylight REMOVE',
      artifacts: { optionId: option.optionId, writeback },
    };
  }

  return {
    scenarioId: 'IS-CERT-405',
    passed: true,
    artifacts: {
      optionId: option.optionId,
      writeback,
      effectivePlanVersionId: effective.planVersionId,
    },
  };
}
