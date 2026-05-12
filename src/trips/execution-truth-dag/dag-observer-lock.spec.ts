import {
  assertDagIsNonDecisionSource,
  isDagObserverOnlyEnabled,
} from './dag-observer-lock';

describe('dag-observer-lock (P-Next 4)', () => {
  const prevObserver = process.env.TRIP_DAG_OBSERVER_ONLY;

  afterEach(() => {
    if (prevObserver === undefined) {
      delete process.env.TRIP_DAG_OBSERVER_ONLY;
    } else {
      process.env.TRIP_DAG_OBSERVER_ONLY = prevObserver;
    }
  });

  it('assertDagIsNonDecisionSource throws when dagUsedForDecision', () => {
    expect(() =>
      assertDagIsNonDecisionSource({ dagUsedForDecision: true }),
    ).toThrow('DAG_DECISION_FORBIDDEN');
  });

  it('isDagObserverOnlyEnabled reads env', () => {
    process.env.TRIP_DAG_OBSERVER_ONLY = '1';
    expect(isDagObserverOnlyEnabled({})).toBe(true);
    delete process.env.TRIP_DAG_OBSERVER_ONLY;
    expect(isDagObserverOnlyEnabled({ dagObserverOnly: true })).toBe(true);
    expect(isDagObserverOnlyEnabled({})).toBe(false);
  });
});
