/**
 * Shared stack for Iceland weather S3 closure harness.
 */

import { WeatherActivityProhibitedRunnerService } from '../execution/weather-activity-prohibited-runner.service';
import { WeatherActivityProhibitedPipelineService } from '../detection/weather-activity-prohibited-pipeline.service';
import { WeatherActivityProhibitedEvaluateService } from '../orchestration/weather-activity-prohibited-evaluate.service';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
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

export const WEATHER_HARNESS_TRIP_ID = 'trip_iceland_weather_s3';
export const WEATHER_HARNESS_ITEM_OUTDOOR = 'item_day2_hike';

export function createWeatherHarnessMockPrisma(tripRows: Record<string, unknown>) {
  const stores = new Map<string, Record<string, unknown>>(
    Object.entries(tripRows) as [string, Record<string, unknown>][],
  );
  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        if ((args.select as { TripDay?: boolean })?.TripDay) return row.trip;
        return {
          id: args.where.id,
          metadata: row.metadata,
          destination: row.destination ?? 'IS',
          updatedAt: row.updatedAt ?? new Date(),
        };
      }),
      findMany: jest.fn(async () =>
        Array.from(stores.entries()).map(([id, row]) => ({
          id,
          metadata: row.metadata,
          destination: row.destination ?? 'IS',
        })),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata?: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata ?? prev.metadata });
        return { metadata: data.metadata };
      }),
    },
    itineraryItem: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          type: 'ACTIVITY',
          note: `Outdoor ${id}`,
          placeId: null,
          bookingStatus: null,
          Place: null,
          TripDay: {
            id: 'day2',
            Trip: { TripDay: [{ id: 'day1' }, { id: 'day2' }] },
          },
        }));
      }),
    },
    stores,
  };
}

export function weatherHarnessTripRow() {
  return {
    metadata: { revision: 17 },
    destination: 'IS',
    updatedAt: new Date('2026-06-30T10:00:00Z'),
    trip: {
      id: WEATHER_HARNESS_TRIP_ID,
      destination: 'IS',
      TripDay: [
        { id: 'day1', date: new Date('2026-02-14'), ItineraryItem: [] },
        {
          id: 'day2',
          date: new Date('2026-02-15'),
          ItineraryItem: [
            {
              id: WEATHER_HARNESS_ITEM_OUTDOOR,
              travelFromPreviousDistance: 5000,
              travelFromPreviousDuration: 60,
              trailId: null,
              Trail: null,
            },
          ],
        },
      ],
    },
  };
}

export interface IcelandWeatherClosureHarnessStack {
  runner: WeatherActivityProhibitedRunnerService;
  authorization: Rfc001AuthorizationService;
  executor: Rfc001PlanVersionApplyExecutor;
  planVersionStore: Rfc001PlanVersionStoreService;
  worldStore: WorldStateStoreService;
  readModel: Rfc001DecisionCenterReadModelService;
  evidenceResolver: EvidenceResolverService;
  problemStore: Rfc001DecisionProblemStoreService;
}

export function buildIcelandWeatherClosureHarnessStack(
  prisma: PrismaService,
): IcelandWeatherClosureHarnessStack {
  const worldStore = new WorldStateStoreService(prisma);
  const evidenceResolver = new EvidenceResolverService(worldStore);
  const problemStore = new Rfc001DecisionProblemStoreService(prisma);
  const problemDetector = new DecisionProblemDetectorService(prisma, problemStore);
  const pipeline = new WeatherActivityProhibitedPipelineService(
    prisma,
    evidenceResolver,
    problemDetector,
  );
  const workspaceService = new DecisionWorkspaceService(prisma);
  const evaluateService = new WeatherActivityProhibitedEvaluateService(
    prisma,
    workspaceService,
    worldStore,
    problemStore,
  );
  const ledgerStore = new Rfc001DecisionLedgerStoreService(prisma);
  const effectivePlanWriteGuard = new EffectivePlanWriteGuardService();
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma, effectivePlanWriteGuard);
  const planVersionService = new Rfc001PlanVersionService(prisma, planVersionStore);
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, { ledgerStore });
  const runner = new WeatherActivityProhibitedRunnerService(
    pipeline,
    evaluateService,
    finalizeService,
    workspaceService,
    problemStore,
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
    worldStore,
    readModel,
    evidenceResolver,
    problemStore,
  };
}
