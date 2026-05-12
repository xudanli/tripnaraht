import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import {
  degenerateDistributionFromDecision,
  mergePolicySampleWithDecision,
  normalizeKernelPMF,
  sampleExecutionDecisionFromRuleBaseline,
  sampleFactorizedExecutionPolicy,
} from './learning-ecps.policy.util';

function ruleDecision(overrides: Partial<ExecutionDecision> = {}): ExecutionDecision {
  return {
    mode: 'RECOMPUTE',
    kernel: 'REASONING_KERNEL',
    features: {
      intensity: 0.8,
      entropy: 0.5,
      determinism: 0.4,
      toolDepth: 'HIGH',
    },
    toolDepth: 'HIGH',
    reuseArtifact: false,
    invalidationScope: 'FULL',
    confidenceGate: 'LOW',
    ...overrides,
  };
}

describe('learning-ecps.policy', () => {
  it('normalizes kernel PMF', () => {
    const n = normalizeKernelPMF({
      REFLEX_KERNEL: 1,
      LIGHTWEIGHT_KERNEL: 1,
      REASONING_KERNEL: 1,
      WORKFLOW_KERNEL: 1,
    });
    const s =
      n.REFLEX_KERNEL + n.LIGHTWEIGHT_KERNEL + n.REASONING_KERNEL + n.WORKFLOW_KERNEL;
    expect(s).toBeCloseTo(1, 5);
  });

  it('degenerate distribution is one-hot at rule decision', () => {
    const d = ruleDecision();
    const dist = degenerateDistributionFromDecision(d);
    expect(dist.kernel.REASONING_KERNEL).toBeCloseTo(1, 5);
    expect(dist.toolDepth.HIGH).toBeCloseTo(1, 5);
  });

  it('degenerate resample reproduces decision fields', () => {
    const d = ruleDecision();
    const rng = () => 0.42;
    const { decision } = sampleExecutionDecisionFromRuleBaseline(d, rng);
    expect(decision.kernel).toBe(d.kernel);
    expect(decision.toolDepth).toBe(d.toolDepth);
  });

  it('REUSE clamp forces reflex kernel when enabled', () => {
    const d = ruleDecision({
      mode: 'REUSE',
      kernel: 'REASONING_KERNEL',
      toolDepth: 'HIGH',
      reuseArtifact: true,
      invalidationScope: 'NONE',
      confidenceGate: 'HIGH',
    });
    const { decision } = mergePolicySampleWithDecision(
      d,
      {
        kernel: 'WORKFLOW_KERNEL',
        toolDepth: 'HIGH',
        intensity: 0.9,
        entropy: 0.9,
        determinism: 0.3,
      },
      { clampReuse: true },
    );
    expect(decision.kernel).toBe('REFLEX_KERNEL');
    expect(decision.toolDepth).toBe('NONE');
  });

  it('sampleFactorizedExecutionPolicy draws valid support', () => {
    const dist = degenerateDistributionFromDecision(ruleDecision());
    const s = sampleFactorizedExecutionPolicy(dist, Math.random);
    expect(['REFLEX_KERNEL', 'LIGHTWEIGHT_KERNEL', 'REASONING_KERNEL', 'WORKFLOW_KERNEL']).toContain(s.kernel);
    expect(['NONE', 'LOW', 'MEDIUM', 'HIGH']).toContain(s.toolDepth);
  });
});
