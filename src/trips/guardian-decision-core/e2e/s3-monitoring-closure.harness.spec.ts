/**
 * S3 closure — world change → monitoring scan → decision queue → accept → execute.
 * @see internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md §5.3
 */

import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { TripMonitoringMvpService } from '../../../decision-runtime/monitoring/trip-monitoring-mvp.service';
import { TripContextSnapshotAssemblerService } from '../../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from './iceland-road-close.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('S3 monitoring closure harness (F208 road close)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevGateway = process.env.DECISION_TRIGGER_GATEWAY_ENABLED;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.DECISION_TRIGGER_GATEWAY_ENABLED = '0';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevGateway === undefined) delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
    else process.env.DECISION_TRIGGER_GATEWAY_ENABLED = prevGateway;
  });

  it('runs world → scan → queue → authorize → execute → effective plan', async () => {
    const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);

    const segmentId = buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE);
    const event = buildRoadStatusChangedEvent({
      tripId: HARNESS_TRIP_ID,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
      sourceProvider: 'admin_injection',
      occurredAt: new Date().toISOString(),
    });

    // 1) World change — assertion only, no DecisionProblem yet
    await stack.evidenceResolver.resolveRoadStatusChanged(event);
    const worldAfterChange = await stack.worldStore.readStore(HARNESS_TRIP_ID);
    expect(worldAfterChange.assertions.some((a) => a.predicate === 'road.status')).toBe(true);
    expect(await stack.problemStore.list(HARNESS_TRIP_ID)).toHaveLength(0);

    // 2) Monitoring scan — detect + run canonical road-close pipeline
    const snapshotAssembler = {
      resolveSnapshotRef: jest.fn(async () => ({
        snapshotId: 'snap_s3',
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
      stack.runner,
      undefined,
      stack.problemStore,
    );

    const scan = await monitoring.scanTrip(HARNESS_TRIP_ID);
    const roadDispatch = scan.dispatches.find((d) => d.kind === 'ROAD_CLOSURE');
    expect(roadDispatch?.status).toBe('COMPLETED');

    const roadItem = scan.items.find((i) => i.kind === 'ROAD_CLOSURE');
    expect(roadItem?.status).toBe('ALERT');
    expect(roadItem?.problemId).toBeDefined();

    const problemId = roadItem!.problemId!;

    // 3) Decision queue — open problem with repair options ready for user
    const problemView = await stack.readModel.getProblemView(HARNESS_TRIP_ID, problemId);
    expect(problemView.options.length).toBeGreaterThanOrEqual(2);
    expect(problemView.record?.decisionId).toBeDefined();
    expect(problemView.problemSummary.status).toBe('WAITING_DECISION');

    // 4) Accept recommended — authorize repair candidate
    const decisionId = problemView.record!.decisionId;
    const recommendedId =
      problemView.record?.selectedCandidateId ??
      problemView.options.find((o) => o.executable)?.id ??
      'cand_a';

    const { record: authorized } = await stack.authorization.authorize({
      tripId: HARNESS_TRIP_ID,
      decisionId,
      choice: recommendedId,
    });
    expect(authorized.recordStatus).toBe('AUTHORIZED');

    // 5) Execute — commit Effective Plan
    const key = buildPlanVersionIdempotencyKey(HARNESS_TRIP_ID, decisionId);
    const executed = await stack.executor.execute({
      tripId: HARNESS_TRIP_ID,
      decisionId,
      idempotencyKey: key,
    });
    expect(executed.planVersion.status).toBe('EFFECTIVE');
    expect(await stack.planVersionStore.getEffectivePlanVersionId(HARNESS_TRIP_ID)).toBe(
      executed.planVersion.planVersionId,
    );

    // 6) Revalidate — trip view reflects effective plan + resolved decision lineage
    const tripView = await stack.readModel.getTripView(HARNESS_TRIP_ID);
    expect(tripView.effectivePlanVersionId).toBe(executed.planVersion.planVersionId);
    expect(tripView.problems.some((p) => p.problemId === problemId)).toBe(true);

    expect(await stack.problemStore.list(HARNESS_TRIP_ID)).toHaveLength(1);

    const replayScan = await monitoring.scanTrip(HARNESS_TRIP_ID);
    expect(replayScan.dispatches.find((d) => d.kind === 'ROAD_CLOSURE')?.status).toBe('COMPLETED');
    expect(replayScan.dispatches.find((d) => d.kind === 'ROAD_CLOSURE')?.detail).toMatch(
      /existing_/,
    );
    expect(replayScan.items.find((i) => i.kind === 'ROAD_CLOSURE')?.problemId).toBe(problemId);
    expect(await stack.problemStore.list(HARNESS_TRIP_ID)).toHaveLength(1);
  });
});
