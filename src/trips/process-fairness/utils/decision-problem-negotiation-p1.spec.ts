import {
  getBindingForProblem,
  writeNegotiationOutcome,
} from './decision-problem-negotiation.store';

describe('decision-problem-negotiation P1 writeback', () => {
  it('persists closed outcome on binding', () => {
    const metadata = writeNegotiationOutcome(null, 'dp-1', {
      closedAt: '2026-07-02T12:00:00.000Z',
      recommendedOptionId: 'opt-a',
      summaryCN: '3 位成员已完成发言',
      utteranceCount: 3,
    });
    expect(getBindingForProblem(metadata, 'dp-1')).toBeNull();

    const withBinding = {
      decisionProblemNegotiations: {
        byProblemId: {
          'dp-1': {
            roundId: 'round-1',
            domain: 'activities',
            decisionNode: 'activity',
            createdAt: '2026-07-02T10:00:00.000Z',
            createdBy: 'user-1',
          },
        },
      },
    };
    const next = writeNegotiationOutcome(withBinding, 'dp-1', {
      closedAt: '2026-07-02T12:00:00.000Z',
      recommendedOptionId: 'opt-a',
      summaryCN: '3 位成员已完成发言',
      utteranceCount: 3,
    });
    expect(getBindingForProblem(next, 'dp-1')?.outcome?.recommendedOptionId).toBe('opt-a');
  });
});
