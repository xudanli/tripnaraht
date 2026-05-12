import { computeFactFreshness } from './world-fact-freshness.util';

describe('computeFactFreshness', () => {
  it('marks expired when validTo is in the past', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const fact = {
      id: '1',
      factKey: 'k',
      subjectType: 'x',
      subjectId: 'y',
      predicate: 'p',
      valueJson: {},
      confidence: 1,
      severity: null,
      sourceType: 't',
      sourceRef: null,
      validFrom: null,
      validTo: past,
      observedAt: past,
      snapshotVersion: null,
      supersedesFactId: null,
      createdAt: past,
    } as any;

    const now = new Date('2025-01-01T00:00:00Z').getTime();
    const f = computeFactFreshness(fact, now);
    expect(f.isExpiredByValidTo).toBe(true);
  });
});
