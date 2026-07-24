import {
  DecisionProblemApplyDeferredStore,
  type DecisionProblemApplyDeferredTask,
} from './decision-problem-apply-deferred.store';

describe('DecisionProblemApplyDeferredStore', () => {
  let store: DecisionProblemApplyDeferredStore;

  beforeEach(() => {
    store = new DecisionProblemApplyDeferredStore();
  });

  function entry(overrides: Partial<DecisionProblemApplyDeferredTask> = {}): DecisionProblemApplyDeferredTask {
    return {
      taskId: 'dp_apply_abc',
      tripId: 'trip1',
      problemId: 'p1',
      userId: 'user1',
      createdAt: Date.now(),
      status: 'pending',
      promise: Promise.resolve({} as never),
      ...overrides,
    };
  }

  it('finds active task for same problem', () => {
    store.put('dp_apply_abc', entry({ status: 'applying' }));
    const found = store.findActiveForProblem('trip1', 'p1');
    expect(found?.taskId).toBe('dp_apply_abc');
  });

  it('ignores completed tasks', () => {
    store.put('dp_apply_done', entry({ status: 'ready' }));
    expect(store.findActiveForProblem('trip1', 'p1')).toBeUndefined();
  });
});
