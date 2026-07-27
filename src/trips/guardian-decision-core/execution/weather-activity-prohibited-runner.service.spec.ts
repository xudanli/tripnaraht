import { WeatherActivityProhibitedRunnerService } from './weather-activity-prohibited-runner.service';
import { WeatherActivityProhibitedPipelineService } from '../detection/weather-activity-prohibited-pipeline.service';
import { WeatherActivityProhibitedEvaluateService } from '../orchestration/weather-activity-prohibited-evaluate.service';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { DecisionProblemDetectorService } from '../detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { buildWeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
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

const tripId = 'trip_iceland_weather_run';
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

function buildWeatherRunner(prisma: PrismaService) {
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
  const finalizeService = buildRfc001DecisionFinalizeService(prisma, { ledgerStore });
  const runner = new WeatherActivityProhibitedRunnerService(
    pipeline,
    evaluateService,
    finalizeService,
    workspaceService,
    problemStore,
  );
  return { runner, ledgerStore };
}

describe('WeatherActivityProhibitedRunnerService (Slice 2 L2)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevPackRules = process.env.DECISION_PACK_RULES;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '1';
    process.env.DECISION_PACK_RULES = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevPackRules === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prevPackRules;
  });

  it('WX-RUN-001: runFullFromEvent → PROPOSED + DEFER_TO_HUMAN', async () => {
    const mock = createMockPrisma({ [tripId]: tripWithOutdoorDay() });
    const prisma = mock as unknown as PrismaService;
    const { runner, ledgerStore } = buildWeatherRunner(prisma);

    const event = buildWeatherHazardChangedEvent({
      tripId,
      windSpeedKmh: 95,
      dayIndex: 1,
    });

    const result = await runner.runFullFromEvent(event);

    expect(result.runId).toMatch(/^run_dec_/);
    expect(result.record?.recordStatus).toBe('PROPOSED');
    expect(result.record?.finalAction).toBe('REPLACE');
    expect(result.record?.selectedCandidateId).toBe('cand_indoor');
    expect(result.humanDecisionRequired).toBe(false);
    expect(result.problem?.semanticCapability).toBe('WEATHER_ACTIVITY_PROHIBITED');
    expect(result.workspace?.status).toBe('FINALIZED');
    expect(result.workspace?.decisionScope?.snapshotId).toBe(
      result.workspace?.worldStateSnapshotId,
    );

    const stored = mock.stores.get(tripId);
    const meta = stored?.metadata as Record<string, unknown>;
    const stamped = meta?.authorityDecisionScopeSignals as {
      constraintScenarioId?: string;
      decisionScope?: { snapshotId?: string };
      affectedPlanItemIds?: string[];
    };
    expect(stamped?.constraintScenarioId).toBe('weather-outdoor-storm');
    expect(stamped?.decisionScope?.snapshotId).toBe(
      result.workspace?.worldStateSnapshotId,
    );
    expect(stamped?.affectedPlanItemIds).toEqual(
      expect.arrayContaining([itemOutdoor]),
    );

    const ref = await ledgerStore.getDecisionRef(tripId);
    expect(ref?.decisionId).toBe(result.record!.decisionId);
  });
});
