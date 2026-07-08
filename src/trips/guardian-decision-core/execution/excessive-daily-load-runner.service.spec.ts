import { ExcessiveDailyLoadRunnerService } from './excessive-daily-load-runner.service';
import { ExcessiveDailyLoadPipelineService } from '../detection/excessive-daily-load-pipeline.service';
import { ExcessiveDailyLoadEvaluateService } from '../orchestration/excessive-daily-load-evaluate.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { buildDailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import { buildRfc001DecisionFinalizeService } from '../testing/rfc001-finalize-test.util';
import type { PrismaService } from '../../../prisma/prisma.service';

function createMockPrisma(tripRows: Record<string, unknown>) {
  const stores = new Map<string, Record<string, unknown>>(Object.entries(tripRows));
  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string }; select?: unknown }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        if ((args.select as { TripDay?: boolean })?.TripDay) {
          return row.trip;
        }
        return {
          id: args.where.id,
          metadata: row.metadata,
          destination: row.destination ?? 'IS',
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

const tripId = 'trip_iceland_load_run';

function tripWithHeavyDay() {
  return {
    metadata: { revision: 17 },
    destination: 'IS',
    updatedAt: new Date('2026-06-30T10:00:00Z'),
    trip: {
      id: tripId,
      destination: 'IS',
      TripDay: [
        {
          id: 'day1',
          date: new Date('2026-02-14'),
          ItineraryItem: [
            {
              id: 'item_drive_long',
              travelFromPreviousDistance: 650000,
              travelFromPreviousDuration: 600,
              trailId: null,
              Trail: null,
            },
          ],
        },
      ],
    },
  };
}

describe('ExcessiveDailyLoadRunnerService (Slice 3)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('LOAD-RUN-001: runFullFromEvent → PROPOSED with EXCESSIVE_DAILY_LOAD', async () => {
    const mock = createMockPrisma({ [tripId]: tripWithHeavyDay() });
    const prisma = mock as unknown as PrismaService;

    const pipeline = new ExcessiveDailyLoadPipelineService(
      prisma,
      { resolveDailyLoadChanged: jest.fn() } as never,
      { detectExcessiveDailyLoadProblem: jest.fn(async (input) => ({
        problemId: 'problem_load_1',
        tripId,
        planVersionId: 'plan_v17',
        type: 'EXCESSIVE_LOAD',
        triggerEventId: input.event.eventId,
        semanticCapability: 'EXCESSIVE_DAILY_LOAD',
        affectedEntityRefs: input.impact.affectedEntityRefs,
        affectedPlanItemIds: input.impact.affectedPlanItemIds,
        worldStateSnapshotId: input.snapshot.snapshotId,
        detectedAt: new Date().toISOString(),
        urgency: 'HIGH',
        status: 'OPEN',
      })) } as never,
    );

    const evaluateService = {
      evaluate: jest.fn(async () => ({
        workspaceId: 'ws_load_1',
        tripId,
        problemId: 'problem_load_1',
        status: 'READY_FOR_FINALIZE',
        revision: 1,
        constraintAssertions: [],
        loadAssessments: [],
        repairCandidates: [{ candidateId: 'cand_split_day' }],
      })),
    } as unknown as ExcessiveDailyLoadEvaluateService;

    const finalizeService = {
      finalizeWorkspace: jest.fn(async () => ({
        runId: 'run_load_1',
        tripId,
        problem: {
          problemId: 'problem_load_1',
          semanticCapability: 'EXCESSIVE_DAILY_LOAD',
        },
        workspace: { workspaceId: 'ws_load_1', status: 'FINALIZED' },
        record: {
          decisionId: 'dec_load_1',
          recordStatus: 'PROPOSED',
          finalAction: 'REPLACE',
          selectedCandidateId: 'cand_split_day',
        },
        planVersion: { status: 'PENDING_AUTHORIZATION' },
        humanDecisionRequired: false,
        shadowMode: true,
      })),
    } as unknown as ReturnType<typeof buildRfc001DecisionFinalizeService>;

    const runner = new ExcessiveDailyLoadRunnerService(
      pipeline,
      evaluateService,
      finalizeService,
      new DecisionWorkspaceService(prisma),
      new Rfc001DecisionProblemStoreService(prisma),
    );

    jest.spyOn(pipeline, 'runFromEvent').mockResolvedValue({
      evidence: {
        event: buildDailyLoadChangedEvent({
          tripId,
          dayIndex: 0,
          drivingHours: 10,
          thresholdHours: 8,
        }),
        assertion: {} as never,
        snapshot: { snapshotId: 'wss_1' } as never,
        resolverVersion: 'evidence-resolver-0.1.0',
        excessiveLoad: true,
        supersededAssertionIds: [],
      },
      impact: {
        dayIndex: 0,
        drivingHours: 10,
        thresholdHours: 8,
        affectedPlanItemIds: ['item_drive_long'],
        affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_drive_long' }],
      },
      problem: {
        problemId: 'problem_load_1',
        tripId,
        planVersionId: 'plan_v17',
        type: 'EXCESSIVE_LOAD',
        triggerEventId: 'evt_1',
        semanticCapability: 'EXCESSIVE_DAILY_LOAD',
        affectedEntityRefs: [],
        affectedPlanItemIds: ['item_drive_long'],
        worldStateSnapshotId: 'wss_1',
        detectedAt: new Date().toISOString(),
        urgency: 'HIGH',
        status: 'OPEN',
      },
    });

    const result = await runner.runFullFromEvent(
      buildDailyLoadChangedEvent({
        tripId,
        dayIndex: 0,
        drivingHours: 10,
        thresholdHours: 8,
      }),
    );

    expect(result.problem?.semanticCapability).toBe('EXCESSIVE_DAILY_LOAD');
    expect(result.record?.recordStatus).toBe('PROPOSED');
  });
});
