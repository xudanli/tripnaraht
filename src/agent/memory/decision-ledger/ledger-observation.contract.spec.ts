import { buildWorldObservationCommit } from './ledger-observation.contract';

describe('ledger-observation.contract', () => {
  it('buildWorldObservationCommit sorts topic names', () => {
    const c = buildWorldObservationCommit({
      observedWorldTopics: ['b', 'a'],
      topicDigests: { a: '1', b: '2' },
      coarseDigest: 'coarse',
    });
    expect(c.observedWorldTopics).toEqual(['a', 'b']);
    expect(c.worldCoarseDigestAtCommit).toBe('coarse');
    expect(c.worldTopicDigestsAtCommit).toEqual({ a: '1', b: '2' });
  });
});
