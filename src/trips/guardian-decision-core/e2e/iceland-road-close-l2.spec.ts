import { RoadSegmentUnavailableRunnerService } from '../execution/road-segment-unavailable-runner.service';
import { RoadSegmentUnavailablePipelineService } from '../detection/road-segment-unavailable-pipeline.service';
import { RoadSegmentUnavailableEvaluateService } from '../orchestration/road-segment-unavailable-evaluate.service';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { RoadCloseImpactAnalyzerService } from '../detection/road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from '../detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { Rfc001PlanVersionStoreService } from '../plan-version/plan-version.store';
import { Rfc001PlanVersionService } from '../plan-version/plan-version.service';
import { Rfc001AuthorizationService } from '../authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../execution/plan-version-apply.executor';
import { Rfc001ItineraryMaterializerService } from '../execution/rfc001-itinerary-materializer.service';
import { DecisionCoreService } from '../services/decision-core.service';
import { buildRfc001DecisionFinalizeService } from '../testing/rfc001-finalize-test.util';
import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import type { PrismaService } from '../../../prisma/prisma.service';

function createMockPrisma(tripRows: Record<string, unknown>) {
  const stores = new Map<string, Record<string, unknown>>(Object.entries(tripRows));
  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        if ((args.select as any)?.TripDay) return row.trip;
        return {
          id: args.where.id,
          metadata: row.metadata,
          updatedAt: row.updatedAt ?? new Date(),
        };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata?: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata ?? prev.metadata });
        return { metadata: data.metadata };
      }),
    },
    stores,
  };
}

const tripId = 'trip_iceland_l2';
const itemDrive = 'item_day3_drive';

function tripWithItinerary() {
  return {
    metadata: {
      revision: 17,
      rfc001IcelandRoadBindings: {
        byItemId: { [itemDrive]: ['F208'] },
      },
    },
    updatedAt: new Date('2026-06-30T10:00:00Z'),
    trip: {
      id: tripId,
      destination: 'IS',
      TripDay: [
        {
          id: 'day3',
          date: new Date('2026-02-15'),
          ItineraryItem: [
            {
              id: itemDrive,
              travelFromPreviousDistance: 120000,
              travelFromPreviousDuration: 90,
              trailId: null,
              Trail: null,
            },
          ],
        },
      ],
    },
  };
}

function buildL2Stack(prisma: PrismaService) {
  const worldStore = new WorldStateStoreService(prisma);
  const evidenceResolver = new EvidenceResolverService(worldStore);
  const impactAnalyzer = new RoadCloseImpactAnalyzerService(prisma);
  const problemStore = new Rfc001DecisionProblemStoreService(prisma);
  const problemDetector = new DecisionProblemDetectorService(prisma, problemStore);
  const pipeline = new RoadSegmentUnavailablePipelineService(
    evidenceResolver,
    impactAnalyzer,
    problemDetector,
  );
  const workspaceService = new DecisionWorkspaceService(prisma);
  const evaluateService = new RoadSegmentUnavailableEvaluateService(
    prisma,
    workspaceService,
    worldStore,
    impactAnalyzer,
    problemStore,
  );
  const ledgerStore = new Rfc001DecisionLedgerStoreService(prisma);
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma);
  const planVersionService = new Rfc001PlanVersionService(prisma, planVersionStore);
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, { ledgerStore });
  const runner = new RoadSegmentUnavailableRunnerService(
    pipeline,
    evaluateService,
    finalizeService,
    workspaceService,
    problemStore,
    ledgerStore,
  );
  const authorization = new Rfc001AuthorizationService(
    ledgerStore,
    workspaceService,
    planVersionService,
    prisma,
  );
  const itineraryMaterializer = new Rfc001ItineraryMaterializerService(prisma);
  const executor = new Rfc001PlanVersionApplyExecutor(
    prisma,
    ledgerStore,
    problemStore,
    workspaceService,
    planVersionStore,
    planVersionService,
    worldStore,
    itineraryMaterializer,
  );
  return { runner, authorization, executor, planVersionStore, ledgerStore, worldStore };
}

describe('RFC-001 L2 flow (PR-E)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('ICE-L2-001: effective unchanged before authorize; switches after execute', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildL2Stack(prisma);

    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(tripId, itemDrive),
    });

    const run = await runner.runFullFromEvent(event);
    expect(run.record!.recordStatus).toBe('PROPOSED');
    expect(run.planVersion!.status).toBe('PENDING_AUTHORIZATION');

    const beforeEffective = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(beforeEffective).toBeUndefined();

    const { record: authorized } = await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: 'cand_a',
    });
    expect(authorized.recordStatus).toBe('AUTHORIZED');
    expect(authorized.selectedCandidateId).toBe('cand_a');

    const stillNoEffective = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(stillNoEffective).toBeUndefined();

    const applied = await executor.execute({
      tripId,
      decisionId: run.record!.decisionId,
    });
    expect(applied.idempotentReplay).toBe(false);
    expect(applied.record.recordStatus).toBe('EFFECTIVE');
    expect(applied.planVersion.status).toBe('EFFECTIVE');

    const effectiveId = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(effectiveId).toBe(applied.planVersion.planVersionId);
  });

  it('ICE-IDEM-001: repeat execute returns same plan version', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildL2Stack(prisma);

    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(tripId, itemDrive),
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: 'cand_b',
    });

    const key = buildPlanVersionIdempotencyKey(tripId, run.record!.decisionId);
    const first = await executor.execute({ tripId, decisionId: run.record!.decisionId, idempotencyKey: key });
    const second = await executor.execute({ tripId, decisionId: run.record!.decisionId, idempotencyKey: key });

    expect(second.idempotentReplay).toBe(true);
    expect(second.planVersion.planVersionId).toBe(first.planVersion.planVersionId);

    const block = await planVersionStore.readBlock(tripId);
    const effectiveCount = block.items.filter((v) => v.status === 'EFFECTIVE').length;
    expect(effectiveCount).toBe(1);
  });

  it('ICE-RB-001: rollback restores parent plan version', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildL2Stack(prisma);

    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(tripId, itemDrive),
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: 'cand_a',
    });
    await executor.execute({ tripId, decisionId: run.record!.decisionId });

    const parentId = run.planVersion!.parentPlanVersionId!;
    const rolled = await executor.rollback({
      tripId,
      decisionId: run.record!.decisionId,
    });

    expect(rolled.effectivePlanVersionId).toBe(parentId);
    expect((await planVersionStore.getEffectivePlanVersionId(tripId))).toBe(parentId);
    expect(rolled.record.recordStatus).toBe('ROLLED_BACK');
  });

  it('ICE-PRE-001: stale effective blocks execute and marks NEEDS_REPAIR', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, ledgerStore, planVersionStore } = buildL2Stack(prisma);

    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(tripId, itemDrive),
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: 'cand_a',
    });

    await planVersionStore.setEffective(tripId, 'plan_v99_stale');

    await expect(
      executor.execute({ tripId, decisionId: run.record!.decisionId }),
    ).rejects.toMatchObject({
      response: { guardCode: 'BASE_PLAN_VERSION_STALE' },
    });

    const record = await ledgerStore.getDecision(tripId, run.record!.decisionId);
    expect(record?.recordStatus).toBe('NEEDS_REPAIR');
  });
});
