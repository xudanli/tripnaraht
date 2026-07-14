/**
 * Evaluate main-chain × OR-Tools shadow attachment (ADR-008).
 * Neptune remains authority; ortoolsShadow is observational only.
 */

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
import type { PrismaService } from '../../../prisma/prisma.service';
import type { OrToolsRoadEvaluateShadowBridge } from '../../../decision-runtime/solver/bridge/ortools-road-evaluate-shadow.bridge';
import type { OrtToolsEvaluateShadowAttachment } from '../../../decision-runtime/solver/bridge/ortools-road-evaluate-shadow.bridge';
import { OrToolsShadowMetricsCollector } from '../../../decision-runtime/solver/observability/ortools-shadow-metrics.collector';
import { selectUsableOrtToolsEvaluateShadow } from '../../../decision-runtime/solver/lab/ortools-shadow-evidence-freshness.util';

const tripId = 'trip_iceland_ortools_shadow';
const items = ['item_a1', 'item_a2', 'item_a3'] as const;

function createMockPrisma() {
  const stores = new Map<string, Record<string, unknown>>();
  stores.set(tripId, {
    metadata: {
      revision: 1,
      rfc001IcelandRoadBindings: {
        byItemId: { [items[0]]: ['F208'], [items[1]]: ['F208'] },
      },
    },
    updatedAt: new Date('2026-07-14T10:00:00Z'),
    trip: {
      id: tripId,
      destination: 'IS',
      TripDay: [
        {
          id: 'day1',
          date: new Date('2026-07-20'),
          ItineraryItem: items.map((id, i) => ({
            id,
            travelFromPreviousDistance: 20000 + i * 5000,
            travelFromPreviousDuration: 30 + i * 10,
            trailId: null,
            Trail: null,
            placeId: 100 + i,
            Place: { id: 100 + i, metadata: { lat: 64 + i * 0.1, lng: -19 } },
          })),
        },
      ],
    },
  });

  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        if ((args.select as { TripDay?: unknown })?.TripDay) return row.trip;
        return {
          id: args.where.id,
          metadata: row.metadata,
          destination: 'IS',
          updatedAt: row.updatedAt ?? new Date(),
        };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata });
        return { metadata: data.metadata };
      }),
    },
    place: {
      findMany: jest.fn(async () => []),
    },
    stores,
  };
}

describe('RoadSegmentUnavailableEvaluate × OR-Tools shadow', () => {
  it('attaches ortoolsShadow without elevating authority repairCandidates', async () => {
    const mock = createMockPrisma();
    const prisma = mock as unknown as PrismaService;

    const shadowAttach: OrtToolsEvaluateShadowAttachment = {
      schemaId: 'tripnara.ortools_evaluate_shadow@v1',
      report: {
        schemaId: 'tripnara.ortools_repair_shadow@v1',
        tripId,
        requestId: 'req-test',
        comparedAt: new Date().toISOString(),
        authorityProviderId: 'neptune-repair',
        shadowProviderId: 'ortools-repair',
        authorityProposalCount: 3,
        shadowProposalCount: 2,
        shadowFoundCandidate: true,
        shadowStatus: 'SOLVED',
        shadowElapsedMs: 40,
        shadowNativeCpSat: false,
        shadowEngine: 'OR_TOOLS_ROUTING',
        forbiddenEdgeViolations: 0,
        bookedNodeDropped: false,
        undeclaredNodeDrops: false,
        writeAttempted: false,
        gatewayRequired: true,
        notes: [],
      },
      gatewayByCandidateId: {
        'ortools:0': {
          candidateId: 'ortools:0',
          overallStatus: 'PASS',
          degraded: false,
          assertionCount: 1,
        },
      },
      neptuneCandidateCount: 3,
      shadowCandidateCount: 2,
      shadowAuthority: false,
      shadowRepairCandidates: [],
    };

    const bridge = {
      run: jest.fn().mockResolvedValue(shadowAttach),
    } as unknown as OrToolsRoadEvaluateShadowBridge;

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
      undefined,
      undefined,
      undefined,
      bridge,
    );

    const segmentId = buildItemSegmentId(tripId, items[0]);
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

    expect(workspace.repairCandidates).toHaveLength(3);
    expect(workspace.repairCandidates.every((c) => c.actor === 'NEPTUNE')).toBe(
      true,
    );
    expect(workspace.ortoolsShadow).toBeDefined();
    expect(workspace.ortoolsShadow!.shadowAuthority).toBe(false);
    expect(workspace.ortoolsShadow!.report.writeAttempted).toBe(false);
    expect(workspace.ortoolsShadow!.neptuneCandidateCount).toBe(3);
    expect(workspace.ortoolsShadow!.shadowCandidateCount).toBe(2);
    expect(workspace.ortoolsShadow!.evidenceFreshness).toBe('FRESH');
    expect(workspace.ortoolsShadow!.evidenceVersionId).toBe(
      workspace.worldStateSnapshotId,
    );
    expect(
      selectUsableOrtToolsEvaluateShadow({
        attachment: workspace.ortoolsShadow,
        currentEvidenceVersionId: workspace.worldStateSnapshotId,
        currentSnapshotId: workspace.worldStateSnapshotId,
      }),
    ).toBeDefined();
    expect(bridge.run).toHaveBeenCalled();
    const bridgeInput = (bridge.run as jest.Mock).mock.calls[0][0];
    expect(bridgeInput.neptuneCandidates).toHaveLength(3);
    expect(bridgeInput.basePlan.segments.length).toBeGreaterThanOrEqual(3);
  });

  it('discards stale prior ortoolsShadow when evidence version changes', async () => {
    const mock = createMockPrisma();
    const prisma = mock as unknown as PrismaService;

    const makeAttach = (
      evidenceVersionId: string,
    ): OrtToolsEvaluateShadowAttachment => ({
      schemaId: 'tripnara.ortools_evaluate_shadow@v1',
      report: {
        schemaId: 'tripnara.ortools_repair_shadow@v1',
        tripId,
        requestId: `req-${evidenceVersionId}`,
        comparedAt: new Date().toISOString(),
        authorityProviderId: 'neptune-repair',
        shadowProviderId: 'ortools-repair',
        authorityProposalCount: 0,
        shadowProposalCount: 1,
        shadowFoundCandidate: true,
        shadowStatus: 'SOLVED',
        shadowElapsedMs: 10,
        shadowNativeCpSat: false,
        shadowEngine: 'OR_TOOLS_ROUTING',
        forbiddenEdgeViolations: 0,
        bookedNodeDropped: false,
        undeclaredNodeDrops: false,
        writeAttempted: false,
        gatewayRequired: true,
        notes: [],
      },
      gatewayByCandidateId: {},
      neptuneCandidateCount: 0,
      shadowCandidateCount: 1,
      shadowAuthority: false,
      shadowRepairCandidates: [],
      evidenceVersionId,
      snapshotId: evidenceVersionId,
    });

    const bridge = {
      run: jest.fn().mockImplementation(async (input: { problem: { worldStateSnapshotId: string } }) =>
        makeAttach(input.problem.worldStateSnapshotId),
      ),
    } as unknown as OrToolsRoadEvaluateShadowBridge;

    const metrics = new OrToolsShadowMetricsCollector();
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
      undefined,
      undefined,
      undefined,
      bridge,
      metrics,
    );

    const segmentId = buildItemSegmentId(tripId, items[0]);
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
      sourceProvider: 'admin_injection',
    });
    const pipelineResult = await pipeline.runFromEvent(event);
    const problemId = pipelineResult.problem!.problemId;

    const ws1 = await evaluateService.evaluateByProblemId(tripId, problemId);
    expect(ws1.ortoolsShadow?.evidenceFreshness).toBe('FRESH');
    expect(metrics.snapshot().staleDiscardTotal).toBe(0);

    // Simulate evidence drift on an existing workspace (same problemId)
    const drifted = await workspaceService.save(tripId, {
      ...ws1,
      ortoolsShadow: makeAttach('ev-stale-prior'),
      revision: ws1.revision + 1,
    });
    expect(drifted.ortoolsShadow?.evidenceVersionId).toBe('ev-stale-prior');

    const ws2 = await evaluateService.evaluateByProblemId(tripId, problemId);
    expect(ws2.ortoolsShadow?.evidenceFreshness).toBe('FRESH');
    expect(ws2.ortoolsShadow?.discardedStalePrior).toBe(true);
    expect(ws2.ortoolsShadow?.evidenceVersionId).toBe(ws2.worldStateSnapshotId);
    expect(ws2.ortoolsShadow?.evidenceVersionId).not.toBe('ev-stale-prior');
    expect(metrics.snapshot().staleDiscardTotal).toBe(1);
  });
});
