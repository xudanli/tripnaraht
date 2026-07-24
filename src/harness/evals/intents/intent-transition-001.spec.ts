import { buildIcelandPlanningContextFixture } from '../fixtures/contexts/iceland-planning.fixture';
import {
  assertIntentTransition001,
  assertIntentTransition002,
  assertIntentTransition003,
  simulateIntentTransition,
} from './intent-transition.util';
import {
  evaluateContextInvariants,
} from '../../invariants/context-invariant.registry';
import {
  expectTravelContextHarnessPass,
  runTravelContextHarnessCase,
} from '../../protocol/run-travel-context-harness.util';

describe('INTENT-TRANSITION-001 — valid intent advances revision', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('SELECT_ROUTE with matching basedOnRevision → APPLIED, revision++', async () => {
    const transition = simulateIntentTransition({
      snapshot,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: snapshot.meta.revision,
        payload: { routeId: 'route_fixture_b' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'intent-001',
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'INTENT-TRANSITION-001',
      snapshot,
      outputSnapshot: transition.outputSnapshot,
      trace: transition.trace,
      invariantIds: ['CTX-STATE-002', 'CTX-AUTH-004', 'CTX-AUTH-005'],
      authorityRunId: 'intent-001',
      run: async () => assertIntentTransition001(snapshot, transition),
    });

    expectTravelContextHarnessPass(result);
    expect(transition.outputSnapshot.plan.selectedRouteId).toBe('route_fixture_b');
  });
});

describe('INTENT-TRANSITION-002 — stale basedOnRevision rejected', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('stale basedOnRevision → REJECTED, revision unchanged', async () => {
    const transition = simulateIntentTransition({
      snapshot,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: snapshot.meta.revision - 1000,
        payload: { routeId: 'route_stale' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'intent-002',
    });

    const result = await runTravelContextHarnessCase({
      caseId: 'INTENT-TRANSITION-002',
      snapshot,
      run: async () => assertIntentTransition002(snapshot, transition),
    });

    expectTravelContextHarnessPass(result);
  });
});

describe('INTENT-TRANSITION-003 — non-canonical cannot apply plan', () => {
  const snapshot = buildIcelandPlanningContextFixture();

  it('LEGACY APPLY_PLAN → REJECTED, effectivePlan unchanged', async () => {
    const transition = simulateIntentTransition({
      snapshot,
      intent: {
        type: 'APPLY_PLAN',
        basedOnRevision: snapshot.meta.revision,
        payload: { planVersionId: 'pv_malicious' },
      },
      runtimeAuthority: 'LEGACY',
      authorityRunId: 'intent-003',
    });

    const invariants = evaluateContextInvariants({
      invariantIds: ['CTX-AUTH-001', 'CTX-AUTH-002'],
      before: snapshot,
      after: transition.outputSnapshot,
      trace: transition.trace,
    });
    expect(invariants.every((i) => i.pass)).toBe(true);

    const result = await runTravelContextHarnessCase({
      caseId: 'INTENT-TRANSITION-003',
      snapshot,
      run: async () => assertIntentTransition003(snapshot, transition),
    });

    expectTravelContextHarnessPass(result);
  });
});
