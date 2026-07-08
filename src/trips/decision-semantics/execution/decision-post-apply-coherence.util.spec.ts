import {
  isIllegalAppliedWithIncompleteCoherence,
  runPostApplyCoherenceCheck,
} from './decision-post-apply-coherence.util';

describe('decision-post-apply-coherence.util', () => {
  it('returns COMPLETE when validate succeeds', async () => {
    const result = await runPostApplyCoherenceCheck({
      tripId: 't1',
      validate: async () => ({ ok: true }),
    });
    expect(result.outcome).toBe('COMPLETE');
  });

  it('returns ROLLED_BACK when validate fails and rollback ok', async () => {
    const result = await runPostApplyCoherenceCheck({
      tripId: 't1',
      validate: async () => {
        throw new Error('ROUTE_RECALC_FAILED');
      },
      rollback: async () => ({ ok: true }),
    });
    expect(result.outcome).toBe('ROLLED_BACK');
  });

  it('returns PARTIALLY_APPLIED when validate fails and rollback unavailable', async () => {
    const result = await runPostApplyCoherenceCheck({
      tripId: 't1',
      validate: async () => {
        throw new Error('ROUTE_RECALC_FAILED');
      },
    });
    expect(result.outcome).toBe('PARTIALLY_APPLIED');
    expect(result.needsRepair).toBe(true);
  });

  it('flags illegal EXECUTED/APPLIED with incomplete coherence', () => {
    expect(
      isIllegalAppliedWithIncompleteCoherence({
        recordStatus: 'EXECUTED',
        executionStatus: 'APPLIED',
        postApplyOutcome: 'PARTIALLY_APPLIED',
      }),
    ).toBe(true);
  });
});
