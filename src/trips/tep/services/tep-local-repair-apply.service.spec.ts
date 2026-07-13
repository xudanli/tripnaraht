import type { PlanVersion } from '../../guardian-decision-core/contracts/plan-version.types';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import { Rfc001ItineraryMaterializerService } from '../../guardian-decision-core/execution/rfc001-itinerary-materializer.service';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import type { RecoveryGraph } from '../contracts/tep-self-drive.types';
import { ExecutabilityAssessmentService } from './executability-assessment.service';
import { TepPlanMetadataService } from './tep-plan-metadata.service';
import { TepLocalRepairApplyService } from './tep-local-repair-apply.service';
import { TepRepairExecutionStore } from './tep-repair-execution.store';
import {
  buildTepRepairIdempotencyKey,
  buildTepRepairInterventionId,
  parseTepRepairOptionId,
  resolveItineraryItemIdFromActivityRef,
} from '../utils/tep-repair-intervention.util';

const optionId = 'REPAIR-SDR101-D1-activity_item_stop_1';
const recoveryGraph: RecoveryGraph = {
  schemaId: 'tripnara/recovery_graph@v1',
  removableNodes: ['activity_item_stop_1'],
  movableNodes: [],
  replaceableNodes: [],
  protectedNodes: [],
  dependencies: [],
  fallbackOptions: [
    {
      optionId,
      triggerRuleId: 'SDR-101',
      action: 'REMOVE',
      targetRefs: ['activity_item_stop_1', 'day_1'],
      description: '删除可选停靠，释放约 40 分钟',
    },
  ],
};

describe('tep-repair-intervention.util', () => {
  it('parses intervention-tep- prefix', () => {
    expect(parseTepRepairOptionId(buildTepRepairInterventionId(optionId))).toBe(optionId);
    expect(parseTepRepairOptionId(optionId)).toBe(optionId);
  });

  it('resolves activity ref to item id', () => {
    expect(resolveItineraryItemIdFromActivityRef('activity_item_stop_1')).toBe('item_stop_1');
    expect(resolveItineraryItemIdFromActivityRef('day_1')).toBeUndefined();
  });
});

describe('TepLocalRepairApplyService', () => {
  const tripId = 'trip_repair_1';
  const userId = 'user_1';
  const parentPlanVersionId = 'plan_v1';

  function createService(overrides?: {
    versions?: PlanVersion[];
    executionKeys?: Record<string, { planVersionId: string; decisionId: string; appliedAt: string }>;
    itemIds?: string[];
    graph?: RecoveryGraph;
  }) {
    const versions = overrides?.versions ?? [];
    const executionKeys = overrides?.executionKeys ?? {};

    const mockTx = {
      $executeRaw: jest.fn(async () => undefined),
      tepRepairExecution: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };

    const prisma = {
      itineraryItem: {
        findMany: jest.fn(async () =>
          (overrides?.itemIds ?? ['item_stop_1']).map((id) => ({ id })),
        ),
      },
      $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    } as unknown as import('../../../prisma/prisma.service').PrismaService;

    const planVersionStore = {
      getExecution: jest.fn(async (_tripId: string, key: string) => executionKeys[key]),
      get: jest.fn(async (_tripId: string, id: string) => versions.find((v) => v.planVersionId === id)),
      getEffectivePlanVersionId: jest.fn(async () => parentPlanVersionId),
      upsert: jest.fn(async (_tripId: string, version: PlanVersion) => {
        const idx = versions.findIndex((v) => v.planVersionId === version.planVersionId);
        if (idx >= 0) versions[idx] = version;
        else versions.push(version);
        return version;
      }),
      setEffective: jest.fn(async () => ({ items: versions, effectivePlanVersionId: versions.at(-1)?.planVersionId })),
      recordExecution: jest.fn(async (_tripId: string, key: string, entry: { planVersionId: string; decisionId: string }) => {
        executionKeys[key] = { ...entry, appliedAt: new Date().toISOString() };
      }),
    } as unknown as Rfc001PlanVersionStoreService;

    const planMetadata = {
      loadTepMetadata: jest.fn(async () => ({
        planVersionId: parentPlanVersionId,
        tep: {
          schemaId: 'tripnara/tep_plan_version_metadata@v1' as const,
          decisionHooks: [],
          recoveryGraph: overrides?.graph ?? recoveryGraph,
          syncedAt: new Date().toISOString(),
        },
      })),
    } as unknown as TepPlanMetadataService;

    const itineraryMaterializer = {
      applyPlanOperations: jest.fn(async () => ({
        applied: true,
        skipped: false,
        removedItemIds: ['item_stop_1'],
        createdItemIds: ['substitute_item_1'],
        updatedItemIds: [],
        journalEntries: [],
      })),
    } as unknown as Rfc001ItineraryMaterializerService;

    const executability = {
      getExecutability: jest.fn(async () => ({ tripId, hooksPersisted: true })),
    } as unknown as ExecutabilityAssessmentService;

    const service = new TepLocalRepairApplyService(
      prisma,
      planVersionStore,
      planMetadata,
      itineraryMaterializer,
      new EffectivePlanWriteGuardService(),
      executability,
      new TepRepairExecutionStore(),
    );

    return { service, planVersionStore, itineraryMaterializer, executability, versions };
  }

  it('applies REMOVE recovery option and creates effective PlanVersion', async () => {
    const { service, planVersionStore, itineraryMaterializer, executability, versions } =
      createService();

    const result = await service.applyRecoveryOption({
      tripId,
      interventionOrOptionId: buildTepRepairInterventionId(optionId),
      userId,
    });

    expect(result.idempotentReplay).toBe(false);
    expect(result.appliedOptionId).toBe(optionId);
    expect(result.removedItemIds).toEqual(['item_stop_1']);
    expect(result.itineraryMaterialized).toBe(true);
    expect(result.executabilityRefreshed).toBe(true);
    expect(itineraryMaterializer.applyPlanOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId,
        operations: [
          expect.objectContaining({
            kind: 'REMOVE_ITEM',
            parameters: { itineraryItemId: 'item_stop_1', recoveryOptionId: optionId },
          }),
        ],
      }),
    );
    expect(planVersionStore.setEffective).toHaveBeenCalled();
    expect(executability.getExecutability).toHaveBeenCalledWith(tripId, { refresh: true });
    expect(versions[0]?.status).toBe('PENDING_AUTHORIZATION');
    expect(versions[0]?.metadata?.tep).toMatchObject({ recoveryGraphApplied: optionId });
  });

  it('replays idempotent apply for same option', async () => {
    const planVersionId = `${parentPlanVersionId}_tep_${optionId}`;
    const idempotencyKey = buildTepRepairIdempotencyKey(tripId, optionId);
    const existing: PlanVersion = {
      planVersionId,
      tripId,
      parentPlanVersionId,
      createdBy: 'USER',
      operations: [
        {
          operationId: 'op_1',
          kind: 'REMOVE_ITEM',
          targetRefs: [{ kind: 'PLAN_ITEM', id: 'item_stop_1' }],
          parameters: { itineraryItemId: 'item_stop_1' },
        },
      ],
      materializedPlanSnapshotRef: `snap_${planVersionId}`,
      status: 'EFFECTIVE',
      createdAt: '2026-07-12T08:00:00.000Z',
      effectiveAt: '2026-07-12T08:00:00.000Z',
    };

    const { service, itineraryMaterializer } = createService({
      versions: [existing],
      executionKeys: {
        [idempotencyKey]: {
          planVersionId,
          decisionId: 'tep_repair_' + optionId,
          appliedAt: '2026-07-12T08:00:00.000Z',
        },
      },
    });

    const result = await service.applyRecoveryOption({
      tripId,
      interventionOrOptionId: optionId,
      userId,
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.planVersionId).toBe(planVersionId);
    expect(itineraryMaterializer.applyPlanOperations).not.toHaveBeenCalled();
  });

  it('coalesces concurrent apply for same option', async () => {
    const { service, itineraryMaterializer } = createService();
    let releaseMat: () => void = () => undefined;
    const matGate = new Promise<void>((resolve) => {
      releaseMat = resolve;
    });

    (itineraryMaterializer.applyPlanOperations as jest.Mock).mockImplementation(async () => {
      await matGate;
      return {
        applied: true,
        skipped: false,
        removedItemIds: ['item_stop_1'],
        createdItemIds: [],
        updatedItemIds: [],
        journalEntries: [],
      };
    });

    const input = {
      tripId,
      interventionOrOptionId: optionId,
      userId,
    };
    const p1 = service.applyRecoveryOption(input);
    const p2 = service.applyRecoveryOption(input);
    releaseMat();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(itineraryMaterializer.applyPlanOperations).toHaveBeenCalledTimes(1);
    expect(r1.planVersionId).toBe(r2.planVersionId);
  });

  it('rejects stale basePlanVersionId', async () => {
    const { service } = createService();

    await expect(
      service.applyRecoveryOption({
        tripId,
        interventionOrOptionId: optionId,
        userId,
        basePlanVersionId: 'plan_stale_v5',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STALE_REPAIR_OPTION' }),
    });
  });

  it('rejects REPLACE without precomputed replacementPoiId', async () => {
    const replaceGraph: RecoveryGraph = {
      ...recoveryGraph,
      fallbackOptions: [
        {
          optionId: 'FALLBACK-SDR302-D1-activity_x',
          triggerRuleId: 'SDR-302',
          action: 'REPLACE',
          targetRefs: ['activity_item_stop_1'],
          description: '替换天气敏感活动',
        },
      ],
    };

    const { service } = createService({
      graph: replaceGraph,
      itemIds: ['item_stop_1'],
    });

    await expect(
      service.applyRecoveryOption({
        tripId,
        interventionOrOptionId: 'FALLBACK-SDR302-D1-activity_x',
        userId,
      }),
    ).rejects.toThrow('replacementPoiId');
  });

  it('applies REPLACE recovery option with substitute POI', async () => {
    const replaceGraph: RecoveryGraph = {
      ...recoveryGraph,
      fallbackOptions: [
        {
          optionId: 'FALLBACK-SDR302-D1-activity_item_stop_1',
          triggerRuleId: 'SDR-302',
          action: 'REPLACE',
          targetRefs: ['activity_item_stop_1'],
          replacementRef: 'activity_indoor_fallback',
          replacementPoiId: 'poi_indoor_museum',
          description: '替换为室内博物馆',
        },
      ],
    };

    const { service, itineraryMaterializer } = createService({
      graph: replaceGraph,
      itemIds: ['item_stop_1'],
    });

    const result = await service.applyRecoveryOption({
      tripId,
      interventionOrOptionId: 'FALLBACK-SDR302-D1-activity_item_stop_1',
      userId,
    });

    expect(result.appliedAction).toBe('REPLACE');
    expect(result.replacementPoiId).toBe('poi_indoor_museum');
    expect(result.createdItemIds).toEqual(['substitute_item_1']);
    expect(itineraryMaterializer.applyPlanOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            kind: 'REPLACE_ITEM',
            parameters: expect.objectContaining({
              itineraryItemId: 'item_stop_1',
              substitutePoiId: 'poi_indoor_museum',
            }),
          }),
        ],
      }),
    );
  });
});
