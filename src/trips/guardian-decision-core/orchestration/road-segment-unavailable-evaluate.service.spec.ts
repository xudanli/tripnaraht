import { RoadSegmentUnavailableEvaluateService } from './road-segment-unavailable-evaluate.service';
import { RoadSegmentUnavailablePipelineService } from '../detection/road-segment-unavailable-pipeline.service';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { RoadCloseImpactAnalyzerService } from '../detection/road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from '../detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';
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

const tripId = 'trip_iceland_eval';
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

describe('RoadSegmentUnavailableEvaluateService (PR-C)', () => {
  it('ICE-WS-001: evaluate fills workspace with BLOCK original + 3 candidates + READY_FOR_FINALIZE', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;

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

    const segmentId = buildItemSegmentId(tripId, itemDrive);
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
      sourceProvider: 'admin_injection',
    });

    const pipelineResult = await pipeline.runFromEvent(event);
    expect(pipelineResult.problem).not.toBeNull();

    const workspace = await evaluateService.evaluateByProblemId(
      tripId,
      pipelineResult.problem!.problemId,
    );

    expect(workspace.status).toBe('READY_FOR_FINALIZE');
    expect(workspace.repairCandidates).toHaveLength(3);
    expect(workspace.repairCandidates.map((c) => c.candidateId)).toEqual([
      'cand_a',
      'cand_b',
      'cand_c',
    ]);

    const originalBlock = workspace.constraintAssertions.find(
      (a) => a.targetCandidateId === ORIGINAL_CANDIDATE_ID && a.verdict === 'BLOCK',
    );
    expect(originalBlock).toBeDefined();
    expect(originalBlock!.overridable).toBe(false);
    expect(originalBlock!.ruleVersion).toContain('abu-road-constraint');

    expect(workspace.loadAssessments.length).toBeGreaterThanOrEqual(4);
    expect(workspace.loadAssessments[0]?.modelVersion).toContain('dre-road-load');
    for (const candidate of workspace.repairCandidates) {
      expect(candidate.proposedOperations.length).toBeGreaterThan(0);
      expect(candidate.generatorVersion).toContain('neptune-road-repair');
      expect((candidate as any).selectedCandidateId).toBeUndefined();
      expect((candidate as any).finalAction).toBeUndefined();
    }
  });
});
