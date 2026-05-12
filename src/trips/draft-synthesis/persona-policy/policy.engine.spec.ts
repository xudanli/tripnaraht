import { PolicyEngine, gateNumericOptions } from './policy.engine';
import { buildTravelPersona } from './persona-presets';

describe('PolicyEngine', () => {
  it('normalizes engine weights to sum 1', () => {
    const p = buildTravelPersona('u:E', 'EFFICIENCY_HUNTER');
    const pol = PolicyEngine.selectExecutionPolicy(p, { mode: 'EXPLORATION' });
    const s = pol.llmWeight + pol.algoWeight + pol.solverWeight;
    expect(s).toBeCloseTo(1, 5);
    expect(pol.gateProfile).toBe('STRICT');
  });

  it('RELAXER uses LIGHT sim and soft gate', () => {
    const p = buildTravelPersona('u:R', 'RELAXER');
    const pol = PolicyEngine.selectExecutionPolicy(p, { mode: 'BOOTSTRAP' });
    expect(pol.simulationLevel).toBe('LIGHT');
    expect(pol.repairAggressiveness).toBe('LOW');
    expect(pol.gateProfile).toBe('SOFT');
    const g = gateNumericOptions('SOFT');
    expect(g.minAgreementToApprove).toBeLessThan(0.55);
  });

  it('FOODIE biases LLM weight high', () => {
    const p = buildTravelPersona('u:F', 'FOODIE');
    const pol = PolicyEngine.selectExecutionPolicy(p, { mode: 'EXPLORATION' });
    expect(pol.llmWeight).toBeGreaterThan(pol.algoWeight);
    expect(pol.gateProfile).toBe('SOFT');
  });
});
