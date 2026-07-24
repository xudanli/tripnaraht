import {
  DecisionCheckerDeferredStore,
  DECISION_CHECKER_STALE_PENDING_MS,
  type PlanningDecisionCheckerDeferredTask,
} from './decision-checker-deferred.store';

describe('DecisionCheckerDeferredStore', () => {
  it('drops stale pending tasks without decisionChecker', () => {
    const store = new DecisionCheckerDeferredStore();
    const entry: PlanningDecisionCheckerDeferredTask = {
      tripId: 'trip-1',
      createdAt: Date.now() - DECISION_CHECKER_STALE_PENDING_MS - 1_000,
      planningResponse: { tripId: 'trip-1', summary: { total: 0, mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0, byCategory: {} }, conflicts: [] },
      report: { tripId: 'trip-1', issues: [], verdict: { status: 'caution' }, isStale: true, overallScore: 1 },
      status: 'pending',
      promise: new Promise(() => undefined),
    };
    store.put('dc_embed_stale', entry);

    expect(store.findActivePendingForTrip('trip-1')).toBeUndefined();
    expect(store.get('dc_embed_stale')).toBeUndefined();
  });
});
