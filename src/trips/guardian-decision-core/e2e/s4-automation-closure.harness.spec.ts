/**
 * S4 closure — TravelDecisionContract.automation → auto submit/apply after monitoring scan.
 */

import { buildWeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { TripMonitoringMvpService } from '../../../decision-runtime/monitoring/trip-monitoring-mvp.service';
import { MonitoringAutoTriggerService } from '../../../decision-runtime/monitoring/monitoring-auto-trigger.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import {
  buildIcelandWeatherClosureHarnessStack,
  createWeatherHarnessMockPrisma,
  weatherHarnessTripRow,
  WEATHER_HARNESS_TRIP_ID,
} from './iceland-weather-closure.harness.util';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from './iceland-road-close.harness.util';
import {
  buildS4AutomationChain,
  tripMetadataWithAutomation,
} from './s4-automation-closure.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('S4 automation closure harness', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevPackRules = process.env.DECISION_PACK_RULES;
  const prevAutomation = process.env.DECISION_AUTOMATION_CHAIN_ENABLED;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.DECISION_PACK_RULES = '1';
    process.env.DECISION_AUTOMATION_CHAIN_ENABLED = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevPackRules === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prevPackRules;
    if (prevAutomation === undefined) delete process.env.DECISION_AUTOMATION_CHAIN_ENABLED;
    else process.env.DECISION_AUTOMATION_CHAIN_ENABLED = prevAutomation;
  });

  it('auto-applies weather hazard after monitoring scan without manual authorize', async () => {
    const mock = createWeatherHarnessMockPrisma({
      [WEATHER_HARNESS_TRIP_ID]: {
        ...weatherHarnessTripRow(),
        metadata: tripMetadataWithAutomation({ revision: 17 }),
      },
    });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandWeatherClosureHarnessStack(prisma);

    await stack.evidenceResolver.resolveWeatherHazardChanged(
      buildWeatherHazardChangedEvent({
        tripId: WEATHER_HARNESS_TRIP_ID,
        windSpeedKmh: 95,
        dayIndex: 1,
      }),
    );

    const monitoring = buildMonitoring(prisma, stack.worldStore, {
      weatherRunner: stack.runner,
      problemStore: stack.problemStore,
    });
    const automationChain = buildS4AutomationChain(prisma, stack);
    const autoTrigger = new MonitoringAutoTriggerService(prisma, monitoring, automationChain);

    const triggerResult = await autoTrigger.scanForChanges(
      [{ type: 'WEATHER_ALERT', dayIndex: 1 }],
      { dayIndex: 1 },
    );

    expect(triggerResult.results).toHaveLength(1);
    const automation = triggerResult.results[0].automation;
    expect(automation?.enabled).toBe(true);
    expect(automation?.attempts).toHaveLength(1);
    expect(automation?.attempts[0]).toMatchObject({
      status: 'APPLIED',
      reasonCodes: expect.arrayContaining(['AUTOMATION_AUTO_ALLOWED']),
    });

    expect(
      await stack.planVersionStore.getEffectivePlanVersionId(WEATHER_HARNESS_TRIP_ID),
    ).toBeDefined();
  });

  it('skips road closure under AUTO_EXECUTE and leaves decision for user confirmation', async () => {
    const mock = createHarnessMockPrisma({
      [HARNESS_TRIP_ID]: {
        ...harnessTripRow(),
        metadata: tripMetadataWithAutomation(harnessTripRow().metadata as Record<string, unknown>),
      },
    });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);

    const segmentId = buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE);
    await stack.evidenceResolver.resolveRoadStatusChanged(
      buildRoadStatusChangedEvent({
        tripId: HARNESS_TRIP_ID,
        roadId: 'F208',
        status: 'CLOSED',
        segmentId,
        sourceProvider: 'admin_injection',
        occurredAt: new Date().toISOString(),
      }),
    );

    const monitoring = buildMonitoring(prisma, stack.worldStore, {
      roadRunner: stack.runner,
      problemStore: stack.problemStore,
    });
    const automationChain = buildS4AutomationChain(prisma, stack);

    const scan = await monitoring.scanTrip(HARNESS_TRIP_ID);
    const roadItem = scan.items.find((i) => i.kind === 'ROAD_CLOSURE');
    expect(roadItem?.status).toBe('ALERT');

    const automation = await automationChain.tryAutoApplyAfterScan(HARNESS_TRIP_ID, scan);
    expect(automation.enabled).toBe(true);
    expect(automation.attempts).toHaveLength(1);
    expect(automation.attempts[0]).toMatchObject({
      status: 'SKIPPED',
      reasonCodes: expect.arrayContaining(['ACTION_TIER_ASK']),
    });

    expect(await stack.planVersionStore.getEffectivePlanVersionId(HARNESS_TRIP_ID)).toBeUndefined();

    const problemView = await stack.readModel.getProblemView(
      HARNESS_TRIP_ID,
      roadItem!.problemId!,
    );
    expect(problemView.problemSummary.status).toBe('WAITING_DECISION');
  });
});

function buildMonitoring(
  prisma: PrismaService,
  worldStore: import('../evidence/world-state-store.service').WorldStateStoreService,
  opts: {
    roadRunner?: import('../execution/road-segment-unavailable-runner.service').RoadSegmentUnavailableRunnerService;
    weatherRunner?: import('../execution/weather-activity-prohibited-runner.service').WeatherActivityProhibitedRunnerService;
    problemStore: import('../persistence/rfc001-decision-problem.store').Rfc001DecisionProblemStoreService;
  },
) {
  const snapshotAssembler = {
    resolveSnapshotRef: jest.fn(async () => ({
      snapshotId: 'snap_s4',
      revision: 'cv17_no_effective_plan_0',
      constraintsVersion: 17,
    })),
  } as unknown as TripContextSnapshotAssemblerService;

  return new TripMonitoringMvpService(
    prisma,
    worldStore,
    snapshotAssembler,
    undefined,
    undefined,
    opts.roadRunner,
    opts.weatherRunner,
    opts.problemStore,
  );
}
