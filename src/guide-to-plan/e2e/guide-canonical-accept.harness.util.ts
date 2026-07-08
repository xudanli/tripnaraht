/**
 * In-memory Prisma mock + RFC-001 stack for Guide canonical accept E2E.
 */

import type { PrismaService } from '../../prisma/prisma.service';
import { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import { DecisionWorkspaceService } from '../../trips/guardian-decision-core/workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import { Rfc001DecisionLedgerStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';
import { Rfc001PlanVersionStoreService } from '../../trips/guardian-decision-core/plan-version/plan-version.store';
import { Rfc001PlanVersionService } from '../../trips/guardian-decision-core/plan-version/plan-version.service';
import { Rfc001AuthorizationService } from '../../trips/guardian-decision-core/authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../../trips/guardian-decision-core/execution/plan-version-apply.executor';
import { Rfc001ItineraryMaterializerService } from '../../trips/guardian-decision-core/execution/rfc001-itinerary-materializer.service';
import { WorldStateStoreService } from '../../trips/guardian-decision-core/evidence/world-state-store.service';
import { WorldStateSnapshotService } from '../../decision-runtime/snapshot/world-state-snapshot.service';
import { buildRfc001DecisionFinalizeService } from '../../trips/guardian-decision-core/testing/rfc001-finalize-test.util';
import { GuideTripMaterializerService } from '../services/guide-trip-materializer.service';
import { GuideCanonicalAcceptService } from '../services/guide-canonical-accept.service';
import type { FullPlanSelectionService } from '../../decision-runtime/core/full-plan-selection.service';
import type { GuideItineraryDraft } from '../services/guide-plan-builder.service';
import { buildPersonaOpinions } from '../utils/guide-plan-candidate-meta.util';
import type { CanonicalConstraintReport } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';

export const GUIDE_E2E_SESSION_ID = 'guide_session_e2e';
export const GUIDE_E2E_CANDIDATE_ID = 'cand_balanced_e2e';
export const GUIDE_E2E_USER_ID = 'user_e2e';

type TripRow = {
  id: string;
  name?: string;
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

type TripDayRow = { id: string; tripId: string; date: Date };
type ItemRow = Record<string, unknown> & { id: string; tripDayId: string };

export type GuidePlanCandidateRow = {
  id: string;
  sessionId: string;
  variant: string;
  status: string;
  itineraryDraft: GuideItineraryDraft;
  personaOpinions: unknown;
};

export interface GuideAcceptHarnessState {
  trips: Map<string, TripRow>;
  tripDays: TripDayRow[];
  items: Map<string, ItemRow>;
  sessions: Map<string, Record<string, unknown>>;
  planCandidates: GuidePlanCandidateRow[];
}

function unverifiedReport(tripId: string): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    tripId,
    evaluatedAt: new Date().toISOString(),
    assertions: [],
    completeness: {
      roads: 'MISSING',
      weather: 'MISSING',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'MISSING',
    },
    overallStatus: 'UNVERIFIED',
    degraded: false,
    degradedReasons: [],
  };
}

export function minimalGuideAcceptDraft(): GuideItineraryDraft {
  return {
    totalDays: 1,
    variant: 'balanced',
    sourceConfidence: 0.8,
    warnings: [],
    days: [
      {
        day: 1,
        date: '2026-08-15',
        items: [
          {
            candidateId: 'slot_blue_lagoon',
            name: '蓝湖',
            type: 'poi',
            source: 'guide',
            startTime: '10:00',
            endTime: '12:00',
          },
          {
            candidateId: 'slot_reykjavik',
            name: '雷克雅未克',
            type: 'poi',
            source: 'guide',
            startTime: '14:00',
            endTime: '17:00',
          },
        ],
        activityCount: 2,
      },
    ],
  };
}

export function seedGuideAcceptHarnessState(): GuideAcceptHarnessState {
  const draft = minimalGuideAcceptDraft();
  return {
    trips: new Map(),
    tripDays: [],
    items: new Map(),
    sessions: new Map([
      [
        GUIDE_E2E_SESSION_ID,
        { id: GUIDE_E2E_SESSION_ID, understandingSummary: null },
      ],
    ]),
    planCandidates: [
      {
        id: GUIDE_E2E_CANDIDATE_ID,
        sessionId: GUIDE_E2E_SESSION_ID,
        variant: 'balanced',
        status: 'draft',
        itineraryDraft: draft,
        personaOpinions: buildPersonaOpinions({
          decisionEngineStatus: 'finalized',
          canonical: {
            finalized: true,
            recommended: true,
            decisionId: 'dec_preview_e2e',
            overallStatus: 'UNVERIFIED',
          },
        }),
      },
    ],
  };
}

export function createGuideAcceptMockPrisma(state: GuideAcceptHarnessState): PrismaService {
  const buildTripDaysWithItems = (tripId: string) => {
    const days = state.tripDays
      .filter((d) => d.tripId === tripId)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return days.map((day) => ({
      id: day.id,
      date: day.date,
      ItineraryItem: [...state.items.values()]
        .filter((item) => item.tripDayId === day.id)
        .sort((a, b) =>
          String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')),
        )
        .map((item) => ({
          id: item.id,
          placeId: item.placeId ?? null,
          travelFromPreviousDistance: item.travelFromPreviousDistance ?? null,
          travelFromPreviousDuration: item.travelFromPreviousDuration ?? null,
          trailId: null,
          Trail: null,
          Place: null,
        })),
    }));
  };

  const txProxy = {
    trip: {
      create: jest.fn(async ({ data }: { data: TripRow }) => {
        state.trips.set(data.id, {
          ...data,
          metadata: (data.metadata as Record<string, unknown>) ?? {},
          updatedAt: data.updatedAt ?? new Date(),
        });
        return data;
      }),
    },
    tripCollaborator: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    tripDay: {
      create: jest.fn(async ({ data }: { data: TripDayRow }) => {
        state.tripDays.push(data);
        return data;
      }),
    },
    guideToPlanSession: {
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const prev = state.sessions.get(where.id) ?? { id: where.id };
          state.sessions.set(where.id, { ...prev, ...data });
          return state.sessions.get(where.id);
        },
      ),
    },
    itineraryItem: {
      create: jest.fn(async ({ data }: { data: ItemRow }) => {
        state.items.set(data.id, data);
        return data;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        state.items.get(where.id) ?? null,
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        state.items.delete(where.id);
        return { id: where.id };
      }),
    },
  };

  return {
    $transaction: jest.fn(async (fn: (tx: typeof txProxy) => Promise<unknown>) => fn(txProxy)),
    $queryRaw: jest.fn(async () => []),
    trip: {
      findUnique: jest.fn(
        async (args: {
          where: { id: string };
          select?: { TripDay?: unknown; metadata?: boolean; updatedAt?: boolean; id?: boolean; destination?: boolean };
        }) => {
          const row = state.trips.get(args.where.id);
          if (!row) return null;
          if (args.select?.TripDay) {
            return {
              id: row.id,
              destination: row.destination ?? 'IS',
              TripDay: buildTripDaysWithItems(row.id),
            };
          }
          return {
            id: row.id,
            metadata: row.metadata,
            updatedAt: row.updatedAt,
            destination: row.destination,
          };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { metadata?: unknown; updatedAt?: Date };
        }) => {
          const prev = state.trips.get(where.id);
          if (!prev) throw new Error(`Trip ${where.id} not found`);
          const next = {
            ...prev,
            metadata: (data.metadata as Record<string, unknown>) ?? prev.metadata,
            updatedAt: data.updatedAt ?? prev.updatedAt,
          };
          state.trips.set(where.id, next);
          return next;
        },
      ),
    },
    tripDay: {
      findMany: jest.fn(async ({ where }: { where: { tripId: string } }) =>
        state.tripDays
          .filter((d) => d.tripId === where.tripId)
          .sort((a, b) => a.date.getTime() - b.date.getTime()),
      ),
    },
    itineraryItem: txProxy.itineraryItem,
    guideInspirationCandidate: {
      findMany: jest.fn(async () => []),
    },
    guidePlanCandidate: {
      findMany: jest.fn(async ({ where }: { where: { sessionId: string; status?: string } }) =>
        state.planCandidates.filter(
          (c) =>
            c.sessionId === where.sessionId &&
            (where.status == null || c.status === where.status),
        ),
      ),
    },
    guideToPlanSession: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        state.sessions.get(where.id) ?? null,
      ),
      update: txProxy.guideToPlanSession.update,
    },
  } as unknown as PrismaService;
}

export interface GuideAcceptHarnessStack {
  acceptService: GuideCanonicalAcceptService;
  planVersionStore: Rfc001PlanVersionStoreService;
  ledgerStore: Rfc001DecisionLedgerStoreService;
  executor: Rfc001PlanVersionApplyExecutor;
  state: GuideAcceptHarnessState;
  prisma: PrismaService;
}

export function buildGuideAcceptHarnessStack(state: GuideAcceptHarnessState): GuideAcceptHarnessStack {
  const prisma = createGuideAcceptMockPrisma(state);
  const guard = new EffectivePlanWriteGuardService();
  const workspaceService = new DecisionWorkspaceService(prisma);
  const problemStore = new Rfc001DecisionProblemStoreService(prisma);
  const ledgerStore = new Rfc001DecisionLedgerStoreService(prisma);
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma, guard);
  const planVersionService = new Rfc001PlanVersionService(prisma, planVersionStore);
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, { ledgerStore });
  const authorization = new Rfc001AuthorizationService(
    ledgerStore,
    workspaceService,
    planVersionService,
    prisma,
  );
  const worldStore = new WorldStateStoreService(prisma);
  const worldStateSnapshot = new WorldStateSnapshotService(worldStore);
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
    guard,
  );

  const fullPlanSelection = {
    evaluatePrebuiltCandidates: jest.fn(
      async (input: {
        context: { tripId: string };
        candidates: Array<{ candidateId: string }>;
        problemId?: string;
      }) => {
        const tripId = input.context.tripId;
        const problemId = input.problemId ?? `guide_accept_e2e_${Date.now()}`;
        const constraintReports: Record<string, CanonicalConstraintReport> = {};
        for (const c of input.candidates) {
          constraintReports[c.candidateId] = unverifiedReport(tripId);
        }
        return { problemId, candidates: input.candidates, constraintReports };
      },
    ),
  } as unknown as FullPlanSelectionService;

  const acceptService = new GuideCanonicalAcceptService(
    prisma,
    new GuideTripMaterializerService(prisma),
    fullPlanSelection,
    workspaceService,
    problemStore,
    finalizeService,
    authorization,
    executor,
    worldStateSnapshot,
  );

  return {
    acceptService,
    planVersionStore,
    ledgerStore,
    executor,
    state,
    prisma,
  };
}
