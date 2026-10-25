import {
  evaluateProactiveL2HighValue,
  resolveProactiveL2HighValueGate,
} from './proactive-l2-high-value-gate.util';

describe('Phase 4 P2 — L2 High-Value gate', () => {
  it('defaults to IV>0.2 ∧ confidence>0.9 ∧ actionability>=0.7', () => {
    const gate = resolveProactiveL2HighValueGate({});
    expect(gate.minInterventionValue).toBe(0.2);
    expect(gate.minConfidence).toBe(0.9);
    expect(gate.minActionability).toBe(0.7);
  });

  it('rejects near-miss values', () => {
    const v = evaluateProactiveL2HighValue({
      interventionValue: 0.2,
      confidence: 0.9,
      actionability: 0.7,
    });
    expect(v.ok).toBe(false);
    expect(v.reasonsZh.length).toBeGreaterThan(0);
  });

  it('accepts strict high-value triple', () => {
    const v = evaluateProactiveL2HighValue({
      interventionValue: 0.21,
      confidence: 0.91,
      actionability: 0.7,
    });
    expect(v.ok).toBe(true);
    expect(v.reasonsZh).toEqual([]);
  });

  it('honors env overrides', () => {
    const v = evaluateProactiveL2HighValue({
      interventionValue: 0.1,
      confidence: 0.5,
      actionability: 0.5,
      env: {
        PROACTIVE_L2_MIN_INTERVENTION_VALUE: '0.05',
        PROACTIVE_L2_MIN_CONFIDENCE: '0.4',
        PROACTIVE_L2_MIN_ACTIONABILITY: '0.4',
      },
    });
    expect(v.ok).toBe(true);
  });
});
