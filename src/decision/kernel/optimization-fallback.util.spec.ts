import { enrichHintsWithFallbackChain } from './optimization-fallback.util';

describe('optimization-fallback.util', () => {
  it('merges fallback_chain into decisionVerdict', () => {
    const out = enrichHintsWithFallbackChain(
      { method: 'HEURISTIC' },
      [{ step: 'cgus_gate', reason: 'cgus_gate_false' }],
      { chosenPlanId: 'heuristic-current' },
    );
    expect(out.decisionVerdict?.fallback_chain?.[0]?.step).toBe('cgus_gate');
    expect(out.decisionVerdict?.chosen_plan_id).toBe('heuristic-current');
  });
});
