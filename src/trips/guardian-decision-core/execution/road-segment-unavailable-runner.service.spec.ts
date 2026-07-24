import { RoadSegmentUnavailableRunnerService } from './road-segment-unavailable-runner.service';
import { RoadSegmentUnavailablePipelineService } from '../detection/road-segment-unavailable-pipeline.service';
import { RoadSegmentUnavailableEvaluateService } from '../orchestration/road-segment-unavailable-evaluate.service';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { RoadCloseImpactAnalyzerService } from '../detection/road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from '../detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { buildRfc001DecisionFinalizeService } from '../testing/rfc001-finalize-test.util';
import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { rfc001DecisionRecordSchema } from '../contracts/schemas/rfc001-phase0.schemas';
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
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata });
        return { metadata: data.metadata };
      }),
    },
    stores,
  };
}

const tripId = 'trip_iceland_run';
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

function buildRunner(prisma: PrismaService) {
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
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, { ledgerStore });
  const runner = new RoadSegmentUnavailableRunnerService(
    pipeline,
    evaluateService,
    finalizeService,
    workspaceService,
    problemStore,
    ledgerStore,
  );
  return { runner, ledgerStore, workspaceService, problemStore };
}

describe('RoadSegmentUnavailableRunnerService (PR-D)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('ICE-RUN-001: runFullFromEvent → REPLACE cand + PROPOSED record + FINALIZED workspace', async () => {
    process.env.RFC001_SHADOW_MODE = '1';
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, ledgerStore } = buildRunner(prisma);

    const segmentId = buildItemSegmentId(tripId, itemDrive);
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
      sourceProvider: 'admin_injection',
    });

    const result = await runner.runFullFromEvent(event);

    expect(result.runId).toMatch(/^run_dec_/);
    expect(result.record).not.toBeNull();
    expect(result.record!.recordStatus).toBe('PROPOSED');
    expect(['REPLACE', 'DEFER_TO_HUMAN']).toContain(result.record!.finalAction);
    expect(result.record!.selectedCandidateId).toMatch(/^cand_[ab]$/);
    expect(result.humanDecisionRequired).toBe(true);
    expect(result.shadowMode).toBe(true);
    expect(result.workspace!.status).toBe('FINALIZED');

    const parsed = rfc001DecisionRecordSchema.safeParse(result.record);
    expect(parsed.success).toBe(true);

    const ref = await ledgerStore.getDecisionRef(tripId);
    expect(ref?.decisionId).toBe(result.record!.decisionId);
    expect(ref?.shadowMode).toBe(true);

    const detail = await runner.getRunDetail(tripId, result.runId);
    expect(detail.record?.decisionId).toBe(result.record!.decisionId);
    expect(detail.workspace?.workspaceId).toBe(result.workspace!.workspaceId);
  });

  it('finalizeByProblemId rejects workspace not READY_FOR_FINALIZE', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, workspaceService } = buildRunner(prisma);

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

    const segmentId = buildItemSegmentId(tripId, itemDrive);
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
    });
    const pipelineResult = await pipeline.runFromEvent(event);
    await workspaceService.createFromProblem(pipelineResult.problem!);
    await expect(
      runner.finalizeByProblemId(tripId, pipelineResult.problem!.problemId),
    ).rejects.toThrow(/READY_FOR_FINALIZE/);
  });
});
