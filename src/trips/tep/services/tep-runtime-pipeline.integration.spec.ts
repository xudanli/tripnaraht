import { RoadSegmentUnavailablePipelineService } from '../../guardian-decision-core/detection/road-segment-unavailable-pipeline.service';
import { EvidenceResolverService } from '../../guardian-decision-core/evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../../guardian-decision-core/evidence/world-state-store.service';
import { RoadCloseImpactAnalyzerService } from '../../guardian-decision-core/detection/road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from '../../guardian-decision-core/detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../../guardian-decision-core/persistence/rfc001-decision-problem.store';
import { buildRoadStatusChangedEvent } from '../../guardian-decision-core/evidence/road-status-changed.event';
import { buildItemSegmentId } from '../../guardian-decision-core/detection/road-close-impact-analyzer';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import { TepRuntimePipelineBridgeService } from './tep-runtime-pipeline.bridge';
import { TepRuntimeTriggerService } from './tep-runtime-trigger.service';
import type { PrismaService } from '../../../prisma/prisma.service';

function createMockPrisma(tripRows: Record<string, unknown>) {
  const stores = new Map<string, Record<string, unknown>>(Object.entries(tripRows));
  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        if ((args.select as { TripDay?: unknown })?.TripDay) return row.trip;
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

const tripId = 'trip_tep_pipeline_301';
const itemDrive = 'item_day3_drive';

const roadHook: DecisionHook = {
  hookId: 'HOOK-ROAD-D3-1',
  targetRef: 'drive_leg_3_1',
  triggerType: 'ROAD_STATUS_CHANGE',
  sourceMetric: 'road.status',
  triggerCondition: {
    metric: 'road.status',
    operator: 'IN',
    value: ['CLOSED', 'LIMITED', 'RESTRICTED'],
  },
  leadTime: 'PT24H',
  impactScope: [itemDrive, 'drive_leg_3_1'],
  defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
  semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
};

describe('RoadSegmentUnavailablePipeline + TepRuntimePipelineBridge', () => {
  it('prefers TEP hook problem over canonical detector when hooks are stored (IS-CERT-301)', async () => {
    const row = {
      metadata: {
        revision: 3,
        rfc001IcelandRoadBindings: { byItemId: { [itemDrive]: ['F208'] } },
        rfc001PlanVersions: {
          items: [
            {
              planVersionId: 'plan_tep_v1',
              tripId,
              createdBy: 'PLANNER',
              operations: [],
              materializedPlanSnapshotRef: 'snap_plan_tep_v1',
              status: 'EFFECTIVE',
              createdAt: '2026-08-01T00:00:00.000Z',
              metadata: {
                tep: {
                  schemaId: 'tripnara/tep_plan_version_metadata@v1',
                  decisionHooks: [roadHook],
                  syncedAt: '2026-08-01T00:00:00.000Z',
                },
              },
            },
          ],
          effectivePlanVersionId: 'plan_tep_v1',
        },
      },
      updatedAt: new Date('2026-08-09T08:00:00Z'),
      trip: {
        id: tripId,
        destination: 'IS',
        TripDay: [
          {
            id: 'day3',
            date: new Date('2026-08-09'),
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

    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const worldStore = new WorldStateStoreService(prisma);
    const evidenceResolver = new EvidenceResolverService(worldStore);
    const impactAnalyzer = new RoadCloseImpactAnalyzerService(prisma);
    const problemStore = new Rfc001DecisionProblemStoreService(prisma);
    const problemDetector = new DecisionProblemDetectorService(prisma, problemStore);

    const planVersionStore = {
      getEffectivePlanVersionId: jest.fn(async () => 'plan_tep_v1'),
      get: jest.fn(),
      upsert: jest.fn(),
      setEffective: jest.fn(),
      readBlock: jest.fn(),
    } as unknown as import('../../guardian-decision-core/plan-version/plan-version.store').Rfc001PlanVersionStoreService;

    const trigger = new TepRuntimeTriggerService(
      { loadDecisionHooks: jest.fn(async () => [roadHook]) } as unknown as import('./tep-plan-metadata.service').TepPlanMetadataService,
      problemDetector,
    );
    const bridge = new TepRuntimePipelineBridgeService(trigger, planVersionStore, prisma);

    const pipeline = new RoadSegmentUnavailablePipelineService(
      evidenceResolver,
      impactAnalyzer,
      problemDetector,
      bridge,
    );

    const segmentId = buildItemSegmentId(tripId, itemDrive);
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: 'F208',
      status: 'CLOSED',
      previousStatus: 'OPEN',
      segmentId,
      sourceProvider: 'admin_injection',
    });

    const result = await pipeline.runFromEvent(event);

    expect(result.tepTrigger?.matched).toBe(true);
    expect(result.tepTrigger?.transitioned).toBe(true);
    expect(result.problem?.type).toBe('RESOURCE_UNAVAILABLE');
    expect(result.problem?.semanticCapability).toBe('ROAD_SEGMENT_UNAVAILABLE');
    expect(result.problem?.planVersionId).toBe('plan_tep_v1');
  });
});
