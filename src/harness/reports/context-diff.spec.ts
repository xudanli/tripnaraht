import { buildIcelandPlanningContextFixture } from '../evals/fixtures/contexts/iceland-planning.fixture';
import { simulateIntentTransition } from '../evals/intents/intent-transition.util';
import { simulateRoadClosureReplanning } from '../evals/replanning/replanning.util';
import {
  assertContextDiffExpectations,
  computeTravelContextDiff,
} from './context-diff.util';

describe('computeTravelContextDiff', () => {
  const before = buildIcelandPlanningContextFixture();

  it('detects SELECT_ROUTE plan change', () => {
    const transition = simulateIntentTransition({
      snapshot: before,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: before.meta.revision,
        payload: { routeId: 'route_new' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'diff-test-1',
    });

    const diff = computeTravelContextDiff(before, transition.outputSnapshot);
    const assertions = assertContextDiffExpectations(diff, {
      requiredDomains: ['plan', 'history'],
      forbiddenDomains: ['world'],
    });

    expect(diff.toRevision).toBeGreaterThan(diff.fromRevision);
    expect(assertions.every((a) => a.pass)).toBe(true);
  });

  it('detects road closure replan diff without plan mutation', () => {
    const replan = simulateRoadClosureReplanning({
      snapshot: before,
      event: {
        type: 'ROAD_CLOSED',
        roadId: 'IS-F208',
        observedAt: '2026-07-05T10:00:00Z',
        sourceId: 'test',
      },
      authorityRunId: 'diff-test-2',
    });

    const diff = computeTravelContextDiff(before, replan.outputSnapshot);
    const assertions = assertContextDiffExpectations(diff, {
      requiredPaths: ['world.facts', 'decisions.open'],
      forbiddenPaths: ['plan.effectivePlan.versionId'],
      requiredDomains: ['world', 'decisions', 'monitoring'],
      forbiddenDomains: ['plan'],
    });

    expect(assertions.every((a) => a.pass)).toBe(true);
  });
});
