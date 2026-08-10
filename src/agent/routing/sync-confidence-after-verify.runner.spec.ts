import { syncConfidenceAfterVerify } from './sync-confidence-after-verify.runner';
import type { SyncConfidenceAfterVerifyHost } from './sync-confidence-after-verify.host';

describe('sync-confidence-after-verify.runner', () => {
  it('returns decisionState unchanged without kernel', () => {
    const host = { decisionKernel: undefined } as unknown as SyncConfidenceAfterVerifyHost;
    const ds = { id: 'd1' } as any;
    expect(syncConfidenceAfterVerify(host, { errors: [], decision_log: [] } as any, ds)).toBe(
      ds,
    );
  });

  it('lowers confidence when VERIFY errors exist', () => {
    const setConfidence = jest.fn((_ds, c) => ({ confidence: c }));
    const host = {
      decisionKernel: { setConfidence },
    } as unknown as SyncConfidenceAfterVerifyHost;
    const out = syncConfidenceAfterVerify(
      host,
      {
        errors: [{ step: 'VERIFY' }, { step: 'VERIFY' }],
        decision_log: [],
      } as any,
      { id: 'd1' } as any,
    );
    expect(setConfidence).toHaveBeenCalled();
    expect(out.confidence).toBeCloseTo(0.5);
  });
});
