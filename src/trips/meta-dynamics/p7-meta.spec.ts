import type { TripWorldState } from '../decision/world-model';
import { buildMetaReflection } from '../meta-reflection/build-meta-reflection';
import { buildExecutionIdentity } from '../identity-preservation/build-execution-identity';
import { buildMetaExecutionState } from './build-meta-execution-state';
import { evaluateMetaStabilityGuard, DEFAULT_META_STABILITY_LIMITS } from './meta-stability-guard';
import { buildP7EcoClosureAugmentation } from './build-p7-eco-closure';

describe('P-ECO-Closure-7 meta-dynamics', () => {
  const minimalState = {
    context: { destination: 'x', startDate: '2026-01-01', durationDays: 3, preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' } },
    policies: {},
    signals: { reflectiveCausalModel: undefined },
  } as unknown as TripWorldState;

  it('buildMetaReflection is bounded', () => {
    const m = buildMetaReflection(minimalState, {});
    expect(m.policyDrift).toBeGreaterThanOrEqual(0);
    expect(m.policyDrift).toBeLessThanOrEqual(1);
  });

  it('buildExecutionIdentity is stable for same context', () => {
    const a = buildExecutionIdentity(minimalState);
    const b = buildExecutionIdentity(minimalState);
    expect(a.semanticCoreHash).toBe(b.semanticCoreHash);
  });

  it('meta guard trips on extreme adaptation', () => {
    const g = evaluateMetaStabilityGuard({
      adaptationRate: 0.99,
      convergenceRuleChange: 0,
      limits: DEFAULT_META_STABILITY_LIMITS,
    });
    expect(g.freezePolicyEvolution).toBe(true);
    expect(g.reasons.length).toBeGreaterThan(0);
  });

  it('buildP7EcoClosureAugmentation aggregates carriers', () => {
    const aug = buildP7EcoClosureAugmentation({
      state: minimalState,
      lyapunov: {
        value: 0.1,
        delta: -0.02,
        decreasing: true,
        stableRegion: true,
      },
      probabilisticStability: {
        probabilityBelowEpsilon: 0.96,
        epsilon: 0.18,
        tau: 0.95,
        probabilisticallyStable: true,
      },
      convergenceOpts: {},
      iterationKind: 'single_pass',
    });
    expect(aug.metaExecutionState.adaptationRate).toBeGreaterThanOrEqual(0);
    expect(aug.adaptiveLyapunov.stabilityRetentionScore).toBeGreaterThan(0);
    expect(aug.executionIdentity.semanticCoreHash).toHaveLength(32);
  });

  it('buildMetaExecutionState reflects adaptation aggregate', () => {
    const reflection = buildMetaReflection(minimalState, {});
    const meta = buildMetaExecutionState(minimalState, reflection);
    expect(meta.convergencePolicy).toContain('res:');
    expect(meta.adaptationRate).toBeGreaterThanOrEqual(0);
  });
});
