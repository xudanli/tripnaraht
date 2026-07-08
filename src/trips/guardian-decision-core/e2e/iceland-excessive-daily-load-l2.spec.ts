import { ExcessiveDailyLoadRunnerService } from '../execution/excessive-daily-load-runner.service';
import { ExcessiveDailyLoadPipelineService } from '../detection/excessive-daily-load-pipeline.service';
import { ExcessiveDailyLoadEvaluateService } from '../orchestration/excessive-daily-load-evaluate.service';
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
import { buildDailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { DAILY_LOAD_SPLIT_CANDIDATE_ID } from '../adapters/dre-daily-load-repair-candidate.adapter';
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
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata?: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata ?? prev.metadata });
        return { metadata: data.metadata };
      }),
    },
    stores,
  };
}

const tripId = 'trip_iceland_load_l2';

function tripWithHeavyDay() {
  return {
    metadata: { revision: 17 },
    destination: 'IS',
    updatedAt: new Date('2026-06-30T10:00:00Z'),
    trip: {
      id: tripId,
      destination: 'IS',
      TripDay: [
        { id: 'day1', date: new Date('2026-02-14'), ItineraryItem: [] },
        {
          id: 'day2',
          date: new Date('2026-02-15'),
          ItineraryItem: [
            {
              id: 'item_drive_a',
              travelFromPreviousDistance: 325000,
              travelFromPreviousDuration: 300,
              trailId: null,
              Trail: null,
            },
            {
              id: 'item_drive_b',
              travelFromPreviousDistance: 325000,
              travelFromPreviousDuration: 300,
              trailId: null,
              Trail: null,
            },
          ],
        },
      ],
    },
  };
}

function buildLoadL2Stack(prisma: PrismaService) {
  const worldStore = new WorldStateStoreService(prisma);
  const evidenceResolver = new EvidenceResolverService(worldStore);
  const problemStore = new Rfc001DecisionProblemStoreService(prisma);
  const problemDetector = new DecisionProblemDetectorService(prisma, problemStore);
  const pipeline = new ExcessiveDailyLoadPipelineService(
    prisma,
    evidenceResolver,
    problemDetector,
  );
  const workspaceService = new DecisionWorkspaceService(prisma);
  const evaluateService = new ExcessiveDailyLoadEvaluateService(
    prisma,
    workspaceService,
    worldStore,
    problemStore,
  );
  const ledgerStore = new Rfc001DecisionLedgerStoreService(prisma);
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma);
  const planVersionService = new Rfc001PlanVersionService(prisma, planVersionStore);
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, { ledgerStore });
  const runner = new ExcessiveDailyLoadRunnerService(
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
  );
  return { runner, authorization, executor, planVersionStore, ledgerStore };
}

describe('RFC-001 Excessive Daily Load L2 flow (Slice 3)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevPackRules = process.env.DECISION_PACK_RULES;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.DECISION_PACK_RULES = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevPackRules === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prevPackRules;
  });

  it('LOAD-L2-001: effective unchanged before authorize; switches after execute', async () => {
    const row = tripWithHeavyDay();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildLoadL2Stack(prisma);

    const event = buildDailyLoadChangedEvent({
      tripId,
      dayIndex: 1,
      drivingHours: 10,
      thresholdHours: 8,
    });

    const run = await runner.runFullFromEvent(event);
    expect(run.record!.recordStatus).toBe('PROPOSED');
    expect(run.planVersion!.status).toBe('PENDING_AUTHORIZATION');
    expect(run.problem!.semanticCapability).toBe('EXCESSIVE_DAILY_LOAD');

    const beforeEffective = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(beforeEffective).toBeUndefined();

    const { record: authorized } = await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: DAILY_LOAD_SPLIT_CANDIDATE_ID,
    });
    expect(authorized.recordStatus).toBe('AUTHORIZED');
    expect(authorized.selectedCandidateId).toBe(DAILY_LOAD_SPLIT_CANDIDATE_ID);

    const stillNoEffective = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(stillNoEffective).toBeUndefined();

    const applied = await executor.execute({
      tripId,
      decisionId: run.record!.decisionId,
    });
    expect(applied.idempotentReplay).toBe(false);
    expect(applied.record.recordStatus).toBe('EFFECTIVE');
    expect(applied.planVersion.status).toBe('EFFECTIVE');

    const effectiveId = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(effectiveId).toBe(applied.planVersion.planVersionId);
  });

  it('LOAD-IDEM-001: repeat execute returns same plan version', async () => {
    const row = tripWithHeavyDay();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildLoadL2Stack(prisma);

    const event = buildDailyLoadChangedEvent({
      tripId,
      dayIndex: 1,
      drivingHours: 10,
      thresholdHours: 8,
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: DAILY_LOAD_SPLIT_CANDIDATE_ID,
    });

    const key = buildPlanVersionIdempotencyKey(tripId, run.record!.decisionId);
    const first = await executor.execute({
      tripId,
      decisionId: run.record!.decisionId,
      idempotencyKey: key,
    });
    const second = await executor.execute({
      tripId,
      decisionId: run.record!.decisionId,
      idempotencyKey: key,
    });

    expect(second.idempotentReplay).toBe(true);
    expect(second.planVersion.planVersionId).toBe(first.planVersion.planVersionId);

    const block = await planVersionStore.readBlock(tripId);
    const effectiveCount = block.items.filter((v) => v.status === 'EFFECTIVE').length;
    expect(effectiveCount).toBe(1);
  });

  it('LOAD-RB-001: rollback restores parent plan version', async () => {
    const row = tripWithHeavyDay();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildLoadL2Stack(prisma);

    const event = buildDailyLoadChangedEvent({
      tripId,
      dayIndex: 1,
      drivingHours: 10,
      thresholdHours: 8,
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: DAILY_LOAD_SPLIT_CANDIDATE_ID,
    });
    await executor.execute({ tripId, decisionId: run.record!.decisionId });

    const parentId = run.planVersion!.parentPlanVersionId!;
    const rolled = await executor.rollback({
      tripId,
      decisionId: run.record!.decisionId,
    });

    expect(rolled.effectivePlanVersionId).toBe(parentId);
    expect((await planVersionStore.getEffectivePlanVersionId(tripId))).toBe(parentId);
    expect(rolled.record.recordStatus).toBe('ROLLED_BACK');
  });
});
