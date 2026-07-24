import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import { simulateIntentTransition } from '../../harness/evals/intents/intent-transition.util';
import {
  computeTravelContextDiff,
  emptyTravelContextDiff,
  mergeTravelContextDiffs,
} from './travel-context-diff.util';

describe('computeTravelContextDiff', () => {
  const before = buildIcelandPlanningContextFixture();
  const contextId = before.identity.contextId;

  it('detects SELECT_ROUTE plan + history changes', () => {
    const transition = simulateIntentTransition({
      snapshot: before,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: before.meta.revision,
        payload: { routeId: 'route_new' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'diff-prod-1',
    });

    const diff = computeTravelContextDiff(contextId, before, transition.outputSnapshot);
    expect(diff.toRevision).toBeGreaterThan(diff.fromRevision);
    expect(diff.changedDomains).toContain('plan');
    expect(diff.changes.some((c) => c.path === 'plan.selectedRouteId')).toBe(true);
  });

  it('emptyTravelContextDiff when revisions match', () => {
    const diff = emptyTravelContextDiff(contextId, before.meta.revision);
    expect(diff.changes).toHaveLength(0);
    expect(diff.fromRevision).toBe(diff.toRevision);
  });

  it('mergeTravelContextDiffs combines chained transitions', () => {
    const step1 = simulateIntentTransition({
      snapshot: before,
      intent: {
        type: 'UPDATE_INTENT',
        basedOnRevision: before.meta.revision,
        payload: { primaryGoal: 'See glaciers' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'diff-prod-2a',
    });
    const step2 = simulateIntentTransition({
      snapshot: step1.outputSnapshot,
      intent: {
        type: 'SELECT_ROUTE',
        basedOnRevision: step1.outputSnapshot.meta.revision,
        payload: { routeId: 'route_merged' },
      },
      runtimeAuthority: 'CANONICAL',
      authorityRunId: 'diff-prod-2b',
    });

    const d1 = computeTravelContextDiff(contextId, before, step1.outputSnapshot);
    const d2 = computeTravelContextDiff(
      contextId,
      step1.outputSnapshot,
      step2.outputSnapshot,
    );
    const merged = mergeTravelContextDiffs(contextId, [d1, d2]);

    expect(merged.fromRevision).toBe(before.meta.revision);
    expect(merged.toRevision).toBe(step2.outputSnapshot.meta.revision);
    expect(merged.changedDomains).toEqual(
      expect.arrayContaining(['intent', 'plan', 'history']),
    );
  });
});
