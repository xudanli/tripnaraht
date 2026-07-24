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
import { buildWeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { WEATHER_INDOOR_CANDIDATE_ID } from '../adapters/weather-repair-candidate.adapter';
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

const tripId = 'trip_iceland_weather_l2';
const itemOutdoor = 'item_day2_hike';

function tripWithOutdoorDay() {
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
              id: itemOutdoor,
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

function buildWeatherL2Stack(prisma: PrismaService) {
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
  const planVersionStore = new Rfc001PlanVersionStoreService(prisma);
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
  );
  return { runner, authorization, executor, planVersionStore, ledgerStore };
}

describe('RFC-001 Weather L2 flow (Slice 2)', () => {
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

  it('WX-L2-001: effective unchanged before authorize; switches after execute', async () => {
    const row = tripWithOutdoorDay();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildWeatherL2Stack(prisma);

    const event = buildWeatherHazardChangedEvent({
      tripId,
      windSpeedKmh: 95,
      dayIndex: 1,
    });

    const run = await runner.runFullFromEvent(event);
    expect(run.record!.recordStatus).toBe('PROPOSED');
    expect(run.planVersion!.status).toBe('PENDING_AUTHORIZATION');
    expect(run.problem!.semanticCapability).toBe('WEATHER_ACTIVITY_PROHIBITED');

    const beforeEffective = await planVersionStore.getEffectivePlanVersionId(tripId);
    expect(beforeEffective).toBeUndefined();

    const { record: authorized } = await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: WEATHER_INDOOR_CANDIDATE_ID,
    });
    expect(authorized.recordStatus).toBe('AUTHORIZED');
    expect(authorized.selectedCandidateId).toBe(WEATHER_INDOOR_CANDIDATE_ID);

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

  it('WX-IDEM-001: repeat execute returns same plan version', async () => {
    const row = tripWithOutdoorDay();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildWeatherL2Stack(prisma);

    const event = buildWeatherHazardChangedEvent({
      tripId,
      windSpeedKmh: 95,
      dayIndex: 1,
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: WEATHER_INDOOR_CANDIDATE_ID,
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

  it('WX-RB-001: rollback restores parent plan version', async () => {
    const row = tripWithOutdoorDay();
    const mock = createMockPrisma({ [tripId]: row });
    const prisma = mock as unknown as PrismaService;
    const { runner, authorization, executor, planVersionStore } = buildWeatherL2Stack(prisma);

    const event = buildWeatherHazardChangedEvent({
      tripId,
      windSpeedKmh: 95,
      dayIndex: 1,
    });
    const run = await runner.runFullFromEvent(event);
    await authorization.authorize({
      tripId,
      decisionId: run.record!.decisionId,
      choice: WEATHER_INDOOR_CANDIDATE_ID,
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
