/**
 * Shared stack + fixtures for Iceland road-close E2E harness (RFC §18.4).
 */

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
import { buildRfc001DecisionFinalizeService } from '../testing/rfc001-finalize-test.util';
import { Rfc001DecisionCenterReadModelService } from '../read-model/rfc001-decision-center-read-model.service';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import type { PrismaService } from '../../../prisma/prisma.service';

export const HARNESS_TRIP_ID = 'trip_iceland_harness';
export const HARNESS_ITEM_DRIVE = 'item_day3_drive';

function buildHarnessPrismaImpl(tripRows: Record<string, unknown>) {
  const stores = new Map<string, Record<string, unknown>>(
    Object.entries(tripRows) as [string, Record<string, unknown>][],
  );
  return {
    trip: {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        if ((args.select as any)?.TripDay) return row.trip;
        return {
          id: args.where.id,
          metadata: row.metadata,
          updatedAt: row.updatedAt ?? new Date(),
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: { metadata?: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata ?? prev.metadata });
        return { metadata: data.metadata };
      },
    },
    itineraryItem: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          type: 'TRANSIT',
          note: `Drive ${id}`,
          placeId: null,
          bookingStatus: null,
          Place: null,
          TripDay: {
            id: 'day3',
            Trip: {
              TripDay: [{ id: 'day3' }],
            },
          },
        }));
      },
    },
    stores,
  };
}

/** Jest-compatible mock (specs). */
export function createHarnessMockPrisma(tripRows: Record<string, unknown>) {
  const impl = buildHarnessPrismaImpl(tripRows);
  return {
    trip: {
      findUnique: jest.fn(impl.trip.findUnique),
      update: jest.fn(impl.trip.update),
    },
    itineraryItem: {
      findMany: jest.fn(impl.itineraryItem.findMany),
    },
    stores: impl.stores,
  };
}

/** Standalone script mock (no jest). */
export function createHarnessScriptPrisma(tripRows: Record<string, unknown>) {
  return buildHarnessPrismaImpl(tripRows);
}

export function harnessTripRow() {
  return {
    metadata: {
      revision: 17,
      rfc001IcelandRoadBindings: {
        byItemId: { [HARNESS_ITEM_DRIVE]: ['F208'] },
      },
    },
    updatedAt: new Date('2026-06-30T10:00:00Z'),
    trip: {
      id: HARNESS_TRIP_ID,
      destination: 'IS',
      TripDay: [
        {
          id: 'day3',
          date: new Date('2026-02-15'),
          ItineraryItem: [
            {
              id: HARNESS_ITEM_DRIVE,
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

export interface IcelandRoadCloseHarnessStack {
  runner: RoadSegmentUnavailableRunnerService;
  authorization: Rfc001AuthorizationService;
  executor: Rfc001PlanVersionApplyExecutor;
  planVersionStore: Rfc001PlanVersionStoreService;
  ledgerStore: Rfc001DecisionLedgerStoreService;
  workspaceService: DecisionWorkspaceService;
  worldStore: WorldStateStoreService;
  readModel: Rfc001DecisionCenterReadModelService;
  pipeline: RoadSegmentUnavailablePipelineService;
  evidenceResolver: EvidenceResolverService;
  problemStore: Rfc001DecisionProblemStoreService;
}

export function buildIcelandRoadCloseHarnessStack(
  prisma: PrismaService,
): IcelandRoadCloseHarnessStack {
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
  const effectivePlanWriteGuard = new EffectivePlanWriteGuardService();
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma, effectivePlanWriteGuard);
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
    effectivePlanWriteGuard,
  );
  const readModel = new Rfc001DecisionCenterReadModelService(
    prisma,
    problemStore,
    ledgerStore,
    workspaceService,
    planVersionStore,
    worldStore,
  );

  return {
    runner,
    authorization,
    executor,
    planVersionStore,
    ledgerStore,
    workspaceService,
    worldStore,
    readModel,
    pipeline,
    evidenceResolver,
    problemStore,
  };
}
