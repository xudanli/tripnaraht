import { buildIcelandRoadClosureReadyFixture } from '../fixtures/contexts/iceland-road-closure-ready.fixture';
import {
  assertReplanRoadClosure001,
  simulateRoadClosureReplanning,
} from './replanning.util';
import {
  expectTravelContextHarnessPass,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';

describe('REPLAN-ROAD-CLOSURE-001 — road close creates decision without silent plan change', () => {
  const snapshot = buildIcelandRoadClosureReadyFixture();

  it('WORLD_EVENT ROAD_CLOSED → WAITING_USER, world/decisions/monitoring change, plan unchanged', async () => {
    const replan = simulateRoadClosureReplanning({
      snapshot,
      event: {
        type: 'ROAD_CLOSED',
        roadId: 'IS-F208',
        observedAt: '2026-07-05T10:00:00Z',
        sourceId: 'road-authority-is',
      },
      authorizationPolicy: { roadClosure: 'ASK_BEFORE_APPLY' },
      authorityRunId: 'replan-road-closure-001',
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'REPLAN-ROAD-CLOSURE-001',
      snapshot,
      outputSnapshot: replan.outputSnapshot,
      trace: replan.trace,
      invariantIds: [
        'CTX-STATE-002',
        'CTX-AUTH-001',
        'CTX-AUTH-004',
        'CTX-AUTH-005',
        'CTX-WORLD-001',
      ],
      authorityRunId: 'replan-road-closure-001',
      run: async () => assertReplanRoadClosure001(snapshot, replan),
    });

    expectTravelContextHarnessPass(result);
  });

  it('negative control: effective plan version must not drift on road close', async () => {
    const replan = simulateRoadClosureReplanning({
      snapshot,
      event: {
        type: 'ROAD_CLOSED',
        roadId: 'IS-F208',
        observedAt: '2026-07-05T10:00:00Z',
        sourceId: 'road-authority-is',
      },
      authorityRunId: 'replan-road-closure-neg',
    });

    const corrupted = structuredClone(replan.outputSnapshot);
    corrupted.plan.effectivePlan.versionId = 'pv_corrupted';

    const result = await runTravelContextHarnessCase({
      caseId: 'REPLAN-ROAD-CLOSURE-001-NEG',
      snapshot,
      outputSnapshot: corrupted,
      trace: replan.trace,
      invariantIds: ['CTX-AUTH-001'],
      run: async () =>
        assertReplanRoadClosure001(snapshot, {
          ...replan,
          outputSnapshot: corrupted,
        }),
    });

    expect(result.pass).toBe(false);
  });
});
