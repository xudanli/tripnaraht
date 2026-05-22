import {
  isReturnToResearchEnabled,
  pickVerifyHarnessSuggestedAction,
} from './plan-verify-harness-routing.util';

describe('plan-verify-harness-routing.util', () => {
  it('returns RETURN_TO_RESEARCH from last harness failure events', () => {
    const action = pickVerifyHarnessSuggestedAction({
      harnessRuntime: {
        last_harness_failure_events: [
          { step: 'VERIFY', suggestedAction: 'RETURN_TO_RESEARCH', code: 'EVIDENCE_VERSION_MISMATCH' },
        ],
      },
    } as any);
    expect(action).toBe('RETURN_TO_RESEARCH');
  });

  it('infers RETURN_TO_RESEARCH from EVIDENCE_SNAPSHOT_UNBOUND code alone', () => {
    const action = pickVerifyHarnessSuggestedAction({
      harnessRuntime: {
        last_harness_failure_events: [{ step: 'VERIFY', code: 'EVIDENCE_SNAPSHOT_UNBOUND', severity: 'L2' }],
      },
    } as any);
    expect(action).toBe('RETURN_TO_RESEARCH');
  });

  it('defaults RETURN_TO_RESEARCH feature flag to enabled', () => {
    const prev = process.env.DECISION_VERIFY_RETURN_TO_RESEARCH;
    delete process.env.DECISION_VERIFY_RETURN_TO_RESEARCH;
    expect(isReturnToResearchEnabled()).toBe(true);
    process.env.DECISION_VERIFY_RETURN_TO_RESEARCH = prev;
  });
});
