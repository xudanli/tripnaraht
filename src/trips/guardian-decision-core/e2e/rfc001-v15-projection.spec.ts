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
import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { DecisionRecordStoreService } from '../../decision-semantics/persistence/decision-record.store';
import { Rfc001DecisionSemanticsProjectorService } from '../read-model/rfc001-decision-semantics-projector.service';
import { buildRfc001DecisionFinalizeService } from '../testing/rfc001-finalize-test.util';
import { Rfc001DecisionCenterReadModelService } from '../read-model/rfc001-decision-center-read-model.service';
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

const tripId = 'trip_v15_proj';
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

function buildProjectionStack(prisma: PrismaService) {
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
  const decisionRecordStore = new DecisionRecordStoreService(prisma);
  const v15Projector = new Rfc001DecisionSemanticsProjectorService(decisionRecordStore);
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, {
    ledgerStore,
    v15Projector,
  });
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
    v15Projector,
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
    v15Projector,
  );
  const readModel = new Rfc001DecisionCenterReadModelService(
    prisma,
    problemStore,
    ledgerStore,
    workspaceService,
    planVersionStore,
    worldStore,
    v15Projector,
  );
  return { runner, authorization, executor, readModel, decisionRecordStore, ledgerStore };
}

describe('RFC-001 WP4 V1.5 projection', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevProjection = process.env.RFC001_V15_PROJECTION;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.RFC001_V15_PROJECTION = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevProjection === undefined) delete process.env.RFC001_V15_PROJECTION;
    else process.env.RFC001_V15_PROJECTION = prevProjection;
  });

  it('PROJ-004: L2 authorize → execute → decisionSemantics EXECUTED with mutation', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, decisionRecordStore } = buildProjectionStack(prisma);

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

    const approved = await decisionRecordStore.getRecord(tripId, run.record!.decisionId);
    expect(approved?.status).toBe('APPROVED');

    await executor.execute({ tripId, decisionId: run.record!.decisionId });

    const executed = await decisionRecordStore.getRecord(tripId, run.record!.decisionId);
    expect(executed?.status).toBe('EXECUTED');
    expect(executed?.actualMutation?.operations.length).toBeGreaterThan(0);

    const resolutions = await decisionRecordStore.listProblemResolutions(tripId);
    expect(resolutions.some((r) => r.resolvedByDecisionId === run.record!.decisionId)).toBe(true);
  });

  it('PROJ-005: read model prefers persisted decisionSemantics over live bridge', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, readModel, decisionRecordStore } =
      buildProjectionStack(prisma);

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
    await executor.execute({ tripId, decisionId: run.record!.decisionId });

    const persisted = await decisionRecordStore.getRecord(tripId, run.record!.decisionId);
    const view = await readModel.getTripView(tripId);

    expect(view.v15RecordMirror).toEqual(persisted);
    expect(view.v15RecordMirror?.status).toBe('EXECUTED');
  });

  it('PROJ-006: rollback projects ROLLED_BACK ledger row', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, decisionRecordStore } = buildProjectionStack(prisma);

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

    await executor.rollback({ tripId, decisionId: run.record!.decisionId });

    const rolled = await decisionRecordStore.getRecord(tripId, run.record!.decisionId);
    expect(rolled?.status).toBe('ROLLED_BACK');
  });
});
