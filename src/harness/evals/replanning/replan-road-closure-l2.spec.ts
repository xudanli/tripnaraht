import { buildRoadStatusChangedEvent } from '../../../trips/guardian-decision-core/evidence/road-status-changed.event';
import { buildItemSegmentId } from '../../../trips/guardian-decision-core/detection/road-close-impact-analyzer';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from '../../../trips/guardian-decision-core/e2e/iceland-road-close.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';
import { buildIcelandRoadClosureReadyFixture } from '../fixtures/contexts/iceland-road-closure-ready.fixture';
import { buildRfc001RoadCloseBridgeResult } from './rfc001-road-close-context-bridge.util';
import { assertReplanRoadClosure001 } from './replanning.util';
import {
  assertContextDiffExpectations,
  computeTravelContextDiff,
} from '../../reports/context-diff.util';
import {
  expectTravelContextHarnessPass,
  harnessAssert,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';
import { RFC001_REASON_CODES } from '../../../trips/guardian-decision-core/reason-codes/reason-code.registry';

/**
 * REPLAN-ROAD-CLOSURE-L2 — Live RFC001 pipeline projected to Travel Context + Context Diff.
 */
describe('REPLAN-ROAD-CLOSURE-L2 — RFC001 road close × Travel Context bridge', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('RFC001 runFullFromEvent → Travel Context diff without silent plan mutation', async () => {
    const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);

    const before = buildIcelandRoadClosureReadyFixture({
      identity: {
        ...buildIcelandRoadClosureReadyFixture().identity,
        contextId: `ctx_${HARNESS_TRIP_ID}`,
        tripId: HARNESS_TRIP_ID,
      },
    });

    const observedAt = '2026-07-05T10:00:00.000Z';
    const event = buildRoadStatusChangedEvent({
      tripId: HARNESS_TRIP_ID,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId: buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE),
      occurredAt: observedAt,
    });

    const run = await stack.runner.runFullFromEvent(event);
    expect(run.problem).not.toBeNull();
    expect(run.record).not.toBeNull();

    const world = await stack.worldStore.readStore(HARNESS_TRIP_ID);
    const effectiveBefore = await stack.planVersionStore.getEffectivePlanVersionId(HARNESS_TRIP_ID);
    expect(effectiveBefore).toBeUndefined();

    const bridge = buildRfc001RoadCloseBridgeResult({
      before,
      run,
      world,
      roadId: 'F208',
      observedAt,
      authorityRunId: 'replan-l2-001',
    });

    const diff = computeTravelContextDiff(before, bridge.after);

    const result = await runTravelContextHarnessCase({
      caseId: 'REPLAN-ROAD-CLOSURE-L2',
      snapshot: before,
      outputSnapshot: bridge.after,
      trace: bridge.replan.trace,
      invariantIds: [
        'CTX-STATE-002',
        'CTX-AUTH-001',
        'CTX-AUTH-004',
        'CTX-AUTH-005',
        'CTX-WORLD-001',
      ],
      authorityRunId: 'replan-l2-001',
      run: async () => [
        ...assertReplanRoadClosure001(before, bridge.replan),
        ...assertContextDiffExpectations(diff, {
          minChanges: 3,
          requiredPaths: ['world.facts', 'decisions.open'],
          requiredOperations: { 'world.facts': 'ADD', 'decisions.open': 'ADD' },
          forbiddenPaths: ['plan.effectivePlan.versionId'],
          requiredDomains: ['world', 'decisions', 'monitoring'],
          forbiddenDomains: ['plan', 'contract', 'participants'],
        }),
        harnessAssert({
          name: 'rfc001_human_confirmation_required',
          pass: run.record!.reasonCodes.includes(
            RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED,
          ),
          expected: RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED,
          actual: run.record!.reasonCodes,
        }),
        harnessAssert({
          name: 'rfc001_effective_plan_store_unchanged',
          pass: effectiveBefore === undefined,
          expected: undefined,
          actual: effectiveBefore,
        }),
      ],
    });

    expectTravelContextHarnessPass(result);
  });
});
