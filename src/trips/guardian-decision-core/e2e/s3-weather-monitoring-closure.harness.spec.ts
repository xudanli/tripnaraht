/**
 * S3 weather closure — strong wind → monitoring scan → authorize → execute.
 */

import { buildWeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { WEATHER_INDOOR_CANDIDATE_ID } from '../adapters/weather-repair-candidate.adapter';
import { TripMonitoringMvpService } from '../../../decision-runtime/monitoring/trip-monitoring-mvp.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import {
  buildIcelandWeatherClosureHarnessStack,
  createWeatherHarnessMockPrisma,
  weatherHarnessTripRow,
  WEATHER_HARNESS_TRIP_ID,
} from './iceland-weather-closure.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('S3 weather monitoring closure harness (strong wind)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevGateway = process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
  const prevPackRules = process.env.DECISION_PACK_RULES;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.DECISION_TRIGGER_GATEWAY_ENABLED = '0';
    process.env.DECISION_PACK_RULES = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevGateway === undefined) delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
    else process.env.DECISION_TRIGGER_GATEWAY_ENABLED = prevGateway;
    if (prevPackRules === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prevPackRules;
  });

  it('runs world → scan → queue → authorize → execute → effective plan', async () => {
    const mock = createWeatherHarnessMockPrisma({
      [WEATHER_HARNESS_TRIP_ID]: weatherHarnessTripRow(),
    });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandWeatherClosureHarnessStack(prisma);

    const event = buildWeatherHazardChangedEvent({
      tripId: WEATHER_HARNESS_TRIP_ID,
      windSpeedKmh: 95,
      dayIndex: 1,
    });

    await stack.evidenceResolver.resolveWeatherHazardChanged(event);
    expect(await stack.problemStore.list(WEATHER_HARNESS_TRIP_ID)).toHaveLength(0);

    const snapshotAssembler = {
      resolveSnapshotRef: jest.fn(async () => ({
        snapshotId: 'snap_wx',
        revision: 'cv17_no_effective_plan_0',
        constraintsVersion: 17,
      })),
    } as unknown as TripContextSnapshotAssemblerService;

    const monitoring = new TripMonitoringMvpService(
      prisma,
      stack.worldStore,
      snapshotAssembler,
      undefined,
      undefined,
      undefined,
      stack.runner,
      stack.problemStore,
    );

    const scan = await monitoring.scanTrip(WEATHER_HARNESS_TRIP_ID, { dayIndex: 1 });
    const wxDispatch = scan.dispatches.find((d) => d.kind === 'WEATHER_HAZARD');
    expect(wxDispatch?.status).toBe('COMPLETED');

    const wxItem = scan.items.find((i) => i.kind === 'WEATHER_HAZARD');
    expect(wxItem?.status).toBe('ALERT');
    expect(wxItem?.problemId).toBeDefined();

    const problemId = wxItem!.problemId!;
    const problemView = await stack.readModel.getProblemView(WEATHER_HARNESS_TRIP_ID, problemId);
    expect(problemView.options.length).toBeGreaterThanOrEqual(1);
    expect(problemView.record?.decisionId).toBeDefined();

    const decisionId = problemView.record!.decisionId;
    await stack.authorization.authorize({
      tripId: WEATHER_HARNESS_TRIP_ID,
      decisionId,
      choice: WEATHER_INDOOR_CANDIDATE_ID,
    });

    const key = buildPlanVersionIdempotencyKey(WEATHER_HARNESS_TRIP_ID, decisionId);
    const executed = await stack.executor.execute({
      tripId: WEATHER_HARNESS_TRIP_ID,
      decisionId,
      idempotencyKey: key,
    });
    expect(executed.planVersion.status).toBe('EFFECTIVE');
    expect(await stack.planVersionStore.getEffectivePlanVersionId(WEATHER_HARNESS_TRIP_ID)).toBe(
      executed.planVersion.planVersionId,
    );

    const replay = await monitoring.scanTrip(WEATHER_HARNESS_TRIP_ID, { dayIndex: 1 });
    expect(replay.dispatches.find((d) => d.kind === 'WEATHER_HAZARD')?.detail).toMatch(
      /existing_/,
    );
    expect(replay.items.find((i) => i.kind === 'WEATHER_HAZARD')?.problemId).toBe(problemId);
  });
});
