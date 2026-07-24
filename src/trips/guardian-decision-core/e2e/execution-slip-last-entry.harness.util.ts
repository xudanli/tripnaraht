/**
 * Slice 3 E9 — execution slip last-entry harness stack.
 */

import { ExecutionSlipRunnerService } from '../execution/execution-slip-runner.service';
import { ExecutionSlipPipelineService } from '../detection/execution-slip-pipeline.service';
import { ExecutionSlipEvaluateService } from '../orchestration/execution-slip-evaluate.service';
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
import { PoiExecutionWindowResolverService } from '../services/poi-execution-window.resolver';
import { ExecutionDepartureObservationStoreService } from '../persistence/execution-departure-observation.store';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ExecutionDepartureObservation } from '../contracts/execution-slip.types';

export const HARNESS_EXEC_TRIP_ID = 'trip_exec_slip_harness';
export const HARNESS_ACTIVITY_A = 'item_poi_a';
export const HARNESS_ACTIVITY_B = 'item_poi_b';

export const HARNESS_PLANNED_DEPART = '2026-07-12T13:00:00.000Z';
export const HARNESS_OBSERVED_LATE = '2026-07-12T13:35:00.000Z';
export const HARNESS_OBSERVED_SLIGHT = '2026-07-12T13:10:00.000Z';
export const HARNESS_REMAINING_STAY = 60;
export const HARNESS_TRAVEL_MINUTES = 103;

function buildHarnessPrismaImpl(tripRows: Record<string, unknown>) {
  type HarnessTripRow = {
    metadata?: unknown;
    updatedAt?: Date;
    trip?: { metadata?: unknown; TripDay?: unknown[]; [key: string]: unknown };
  };
  const stores = new Map<string, HarnessTripRow>(
    Object.entries(tripRows) as [string, HarnessTripRow][],
  );
  return {
    trip: {
      findUnique: async (args: { where: { id: string }; select?: unknown; include?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        const sel = args.select as Record<string, unknown> | undefined;
        if (sel?.TripDay || (args.include as any)?.TripCollaborator) {
          return row.trip;
        }
        if (sel?.metadata && sel?.updatedAt) {
          return {
            id: args.where.id,
            metadata: row.metadata ?? row.trip?.metadata,
            updatedAt: row.updatedAt ?? new Date(),
          };
        }
        return {
          id: args.where.id,
          metadata: row.metadata ?? row.trip?.metadata,
          updatedAt: row.updatedAt ?? new Date(),
          destination: 'IS',
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: { metadata?: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata ?? prev.metadata });
        return { metadata: data.metadata };
      },
    },
    itineraryItem: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: unknown;
      }) => {
        const row = stores.get(HARNESS_EXEC_TRIP_ID) as { trip?: { TripDay?: unknown[] } };
        const days = row?.trip?.TripDay ?? [];
        for (const day of days as Array<{ ItineraryItem: Array<Record<string, unknown>> }>) {
          const item = day.ItineraryItem.find((i) => i.id === where.id);
          if (item) {
            const tripRow = stores.get(HARNESS_EXEC_TRIP_ID);
            const tripMeta = tripRow?.trip?.metadata ?? tripRow?.metadata;
            const tripUpdatedAt = tripRow?.updatedAt ?? new Date();
            if ((select as any)?.TripDay) {
              return {
                ...item,
                TripDay: {
                  tripId: HARNESS_EXEC_TRIP_ID,
                  Trip: { metadata: tripMeta, updatedAt: tripUpdatedAt },
                },
              };
            }
            if ((select as any)?.Place) {
              return item;
            }
            return item;
          }
        }
        return null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = where?.id?.in ?? [];
        return ids.map((id) => ({
          id,
          type: 'ACTIVITY',
          note: id,
          placeId: id === HARNESS_ACTIVITY_B ? 'poi_b_timed' : 'poi_a',
          bookingStatus: null,
          Place:
            id === HARNESS_ACTIVITY_B
              ? {
                  id: 'poi_b_timed',
                  metadata: {
                    lastEntryAt: '16:00',
                    closesAt: '18:00',
                    timezone: 'Atlantic/Reykjavik',
                  },
                }
              : { id: 'poi_a', metadata: {} },
          TripDay: { id: 'day1', Trip: { TripDay: [{ id: 'day1' }] } },
        }));
      },
    },
    stores,
  };
}

export function createExecutionSlipHarnessMockPrisma(tripRows: Record<string, unknown>) {
  const impl = buildHarnessPrismaImpl(tripRows);
  return {
    trip: {
      findUnique: jest.fn(impl.trip.findUnique),
      update: jest.fn(impl.trip.update),
    },
    itineraryItem: {
      findUnique: jest.fn(impl.itineraryItem.findUnique),
      findMany: jest.fn(impl.itineraryItem.findMany),
    },
    stores: impl.stores,
  };
}

export function harnessExecutionSlipTripRow() {
  return {
    metadata: {
      revision: 3,
      rfc001ExecutionActivityContext: {
        byActivityId: {
          [HARNESS_ACTIVITY_A]: {
            plannedDepartAt: HARNESS_PLANNED_DEPART,
            remainingStayMinutes: HARNESS_REMAINING_STAY,
          },
          [HARNESS_ACTIVITY_B]: {
            executionWindow: {
              lastEntryAt: '16:00',
              closesAt: '18:00',
              timezone: 'Atlantic/Reykjavik',
            },
          },
        },
      },
    },
    updatedAt: new Date('2026-07-12T08:00:00Z'),
    trip: {
      id: HARNESS_EXEC_TRIP_ID,
      destination: 'IS',
      metadata: {
        revision: 3,
        rfc001ExecutionActivityContext: {
          byActivityId: {
            [HARNESS_ACTIVITY_A]: {
              plannedDepartAt: HARNESS_PLANNED_DEPART,
              remainingStayMinutes: HARNESS_REMAINING_STAY,
            },
            [HARNESS_ACTIVITY_B]: {
              executionWindow: {
                lastEntryAt: '16:00',
                closesAt: '18:00',
                timezone: 'Atlantic/Reykjavik',
              },
            },
          },
        },
      },
      updatedAt: new Date('2026-07-12T08:00:00Z'),
      TripCollaborator: [{ userId: 'user_harness', role: 'OWNER' }],
      TripDay: [
        {
          id: 'day1',
          date: new Date('2026-07-12'),
          ItineraryItem: [
            {
              id: HARNESS_ACTIVITY_A,
              placeId: 1,
              startTime: new Date('2026-07-12T10:00:00Z'),
              endTime: new Date(HARNESS_PLANNED_DEPART),
              travelFromPreviousDuration: 0,
            },
            {
              id: HARNESS_ACTIVITY_B,
              placeId: 2,
              startTime: new Date('2026-07-12T16:00:00Z'),
              endTime: new Date('2026-07-12T18:00:00Z'),
              travelFromPreviousDuration: HARNESS_TRAVEL_MINUTES,
              Place: {
                id: 2,
                metadata: {
                  poiKey: 'poi_b_timed',
                  lastEntryAt: '16:00',
                  closesAt: '18:00',
                  timezone: 'Atlantic/Reykjavik',
                },
              },
            },
          ],
        },
      ],
    },
  };
}

export interface ExecutionSlipHarnessStack {
  runner: ExecutionSlipRunnerService;
  authorization: Rfc001AuthorizationService;
  executor: Rfc001PlanVersionApplyExecutor;
  planVersionStore: Rfc001PlanVersionStoreService;
  ledgerStore: Rfc001DecisionLedgerStoreService;
  workspaceService: DecisionWorkspaceService;
  worldStore: WorldStateStoreService;
  problemStore: Rfc001DecisionProblemStoreService;
  observationStore: ExecutionDepartureObservationStoreService;
  pipeline: ExecutionSlipPipelineService;
}

export function buildExecutionSlipHarnessStack(
  prisma: PrismaService,
): ExecutionSlipHarnessStack {
  const worldStore = new WorldStateStoreService(prisma);
  const evidenceResolver = new EvidenceResolverService(worldStore);
  const windowResolver = new PoiExecutionWindowResolverService(prisma);
  const problemStore = new Rfc001DecisionProblemStoreService(prisma);
  const problemDetector = new DecisionProblemDetectorService(prisma, problemStore);
  const pipeline = new ExecutionSlipPipelineService(
    prisma,
    evidenceResolver,
    windowResolver,
    problemDetector,
  );
  const workspaceService = new DecisionWorkspaceService(prisma);
  const evaluateService = new ExecutionSlipEvaluateService(
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
  const runner = new ExecutionSlipRunnerService(
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
  const observationStore = new ExecutionDepartureObservationStoreService(prisma);

  return {
    runner,
    authorization,
    executor,
    planVersionStore,
    ledgerStore,
    workspaceService,
    worldStore,
    problemStore,
    observationStore,
    pipeline,
  };
}

export function buildHarnessObservation(
  overrides?: Partial<ExecutionDepartureObservation>,
): ExecutionDepartureObservation {
  return {
    observationId: `obs_harness_${Date.now()}`,
    tripId: HARNESS_EXEC_TRIP_ID,
    planVersionId: 'plan_r3',
    activityId: HARNESS_ACTIVITY_A,
    plannedDepartAt: HARNESS_PLANNED_DEPART,
    observedAt: HARNESS_OBSERVED_LATE,
    stillAtPoi: true,
    source: 'USER_REPORT',
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}
