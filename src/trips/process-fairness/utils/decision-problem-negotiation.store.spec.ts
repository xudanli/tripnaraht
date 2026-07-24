import {
  getBindingForProblem,
  negotiationTaskIdForProblem,
  readNegotiationMetadata,
  writeNegotiationBinding,
} from './decision-problem-negotiation.store';

describe('decision-problem-negotiation.store', () => {
  it('builds negotiation task id from problem id', () => {
    expect(negotiationTaskIdForProblem('dp-1')).toBe('nt:dp-1');
  });

  it('persists problem ↔ round binding in trip metadata', () => {
    const next = writeNegotiationBinding(null, 'dp-1', {
      roundId: 'round-1',
      domain: 'activities',
      decisionNode: 'activity',
      focusConflictId: 'issue-gap-3',
      createdAt: '2026-07-02T00:00:00.000Z',
      createdBy: 'user-1',
    });
    const store = readNegotiationMetadata(next);
    expect(getBindingForProblem(next, 'dp-1')?.roundId).toBe('round-1');
    expect(store.byProblemId['dp-1']?.focusConflictId).toBe('issue-gap-3');
  });
});
