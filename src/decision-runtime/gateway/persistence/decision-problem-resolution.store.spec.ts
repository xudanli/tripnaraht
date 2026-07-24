import { DecisionProblemResolutionStoreService } from '../persistence/decision-problem-resolution.store';

describe('DecisionProblemResolutionStoreService', () => {
  it('builds stable idempotency keys', () => {
    const store = new DecisionProblemResolutionStoreService({} as never);
    expect(store.buildIdempotencyKey('trip1', 'p1', 'cand_a')).toBe(
      'resolution:trip1:p1:cand_a',
    );
  });
});
