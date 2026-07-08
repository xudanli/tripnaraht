import { RoadSegmentUnavailablePipelineService } from './road-segment-unavailable-pipeline.service';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { RoadCloseImpactAnalyzerService } from './road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from './road-close-impact-analyzer';
import type { PrismaService } from '../../../prisma/prisma.service';

function createMockPrisma(tripRows: Record<string, unknown>) {
  const stores = new Map<string, Record<string, unknown>>(Object.entries(tripRows));
  return {
    trip: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const meta = stores.get(where.id);
        if (!meta) return null;
        return { id: where.id, metadata: meta.metadata, updatedAt: meta.updatedAt ?? new Date() };
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

const tripId = 'trip_iceland_1';
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

describe('RoadSegmentUnavailablePipelineService (PR-B)', () => {
  it('ICE-IMPACT-001 + problem: CLOSED → FEASIBILITY_FAILURE with planItemIds', async () => {
    const row = tripWithItinerary();
    const mock = createMockPrisma({ [tripId]: row });
    (mock.trip.findUnique as jest.Mock).mockImplementation(async (args: any) => {
      if (args.select?.TripDay) return row.trip;
      const meta = mock.stores.get(tripId);
      return meta
        ? { id: tripId, metadata: meta.metadata, updatedAt: meta.updatedAt }
        : null;
    });

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

    const segmentId = buildItemSegmentId(tripId, itemDrive);
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
      sourceProvider: 'admin_injection',
    });

    const result = await pipeline.runFromEvent(event);

    expect(result.evidence.hardClosure).toBe(true);
    expect(result.impact.affectedPlanItemIds).toContain(itemDrive);
    expect(result.problem).not.toBeNull();
    expect(result.problem!.type).toBe('FEASIBILITY_FAILURE');
    expect(result.problem!.affectedPlanItemIds).toContain(itemDrive);
    expect(result.problem!.worldStateSnapshotId).toBe(result.evidence.snapshot.snapshotId);
    expect(result.problem!.triggerEventId).toBe(event.eventId);
    expect(result.problem!.planVersionId).toMatch(/^plan_/);
  });
});
