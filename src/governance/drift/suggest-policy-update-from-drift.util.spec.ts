import { suggestPolicyUpdateFromDrift } from './suggest-policy-update-from-drift.util';

describe('suggestPolicyUpdateFromDrift', () => {
  it('returns traceable suggestions for recurring_block', () => {
    const s = suggestPolicyUpdateFromDrift([
      {
        type: 'recurring_block',
        confidence: 0.9,
        evidenceEventIds: ['e1'],
        driftReasonCodes: ['x'],
      },
    ]);
    expect(s.some((x) => x.id === 'drift_tighten_corridor_policy_bundle')).toBe(true);
  });
});
