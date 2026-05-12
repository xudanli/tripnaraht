import { PolicyEngine } from '../persona-policy/policy.engine';
import { buildTravelPersona } from '../persona-policy/persona-presets';
import {
  createDefaultSystemPolicyWeights,
  mergeExecutionPolicyWithGlobal,
  tripRewardComposite,
  updateSystemPolicyWeightsFromTripReward,
} from './global-optimization.engine';

describe('global-optimization.engine', () => {
  it('default system weights preserve persona-normalized policy shape', () => {
    const persona = buildTravelPersona('u:E', 'EXPLORER');
    const base = PolicyEngine.selectExecutionPolicy(persona, { mode: 'EXPLORATION' });
    const merged = mergeExecutionPolicyWithGlobal(base, persona, createDefaultSystemPolicyWeights());
    expect(merged.llmWeight).toBeCloseTo(base.llmWeight, 5);
    expect(merged.algoWeight).toBeCloseTo(base.algoWeight, 5);
    expect(merged.constraintPriorityOrder.length).toBeGreaterThan(0);
  });

  it('boosts LLM share when global engineWeights favor llm', () => {
    const persona = buildTravelPersona('u:F', 'FOODIE');
    const base = PolicyEngine.selectExecutionPolicy(persona, { mode: 'EXPLORATION' });
    const sys = createDefaultSystemPolicyWeights();
    sys.engineWeights = { llm: 1.4, algo: 0.85, solver: 1 };
    const merged = mergeExecutionPolicyWithGlobal(base, persona, sys);
    expect(merged.llmWeight).toBeGreaterThan(base.llmWeight);
  });

  it('tripRewardComposite is bounded 0–1', () => {
    const c = tripRewardComposite({
      tripId: 't1',
      satisfactionScore: 1,
      frictionScore: 0,
      executionStability: 1,
      preferenceAlignment: 1,
      completionRate: 1,
    });
    expect(c).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThan(0.9);
  });

  it('updateSystemPolicyWeightsFromTripReward bumps personaWeights on high reward', () => {
    const prev = createDefaultSystemPolicyWeights();
    const next = updateSystemPolicyWeightsFromTripReward(prev, {
      personaType: 'RELAXER',
      reward: {
        tripId: 't1',
        satisfactionScore: 0.95,
        frictionScore: 0.1,
        executionStability: 0.9,
        preferenceAlignment: 0.9,
        completionRate: 1,
      },
      alpha: 0.1,
    });
    expect((next.personaWeights.RELAXER ?? 0) > (prev.personaWeights.RELAXER ?? 1)).toBe(true);
    expect((next.schemaVersion ?? 0) > (prev.schemaVersion ?? 0)).toBe(true);
  });
});
