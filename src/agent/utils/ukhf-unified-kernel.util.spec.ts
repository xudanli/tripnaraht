import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import { DEFAULT_CAUSAL_FIELD_DYNAMICS } from './cognitive-execution-pipeline.util';
import { ukhfKernelForward } from './ukhf-unified-kernel.util';

const K: CausalInteractionKernel = {
  agentOrder: ['a', 'b'],
  matrix: [
    [0, 0.2],
    [0.2, 0],
  ],
};

const phi0: CausalFieldSnapshot = {
  queryId: 'q',
  timeStep: 0,
  particles: [
    { agentId: 'a', phi: 0.5 },
    { agentId: 'b', phi: 0.3 },
  ],
};

describe('ukhf-unified-kernel.util', () => {
  it('EXEC linear matches SHADOW linear (same 𝓕 under Laplacian)', () => {
    const exec = ukhfKernelForward(phi0, K, 'EXEC', DEFAULT_CAUSAL_FIELD_DYNAMICS, {
      execDynamics: 'LINEAR_LAPLACIAN',
    });
    const shadow = ukhfKernelForward(phi0, K, 'SHADOW', DEFAULT_CAUSAL_FIELD_DYNAMICS);
    expect(exec.particles.map((p) => p.phi)).toEqual(shadow.particles.map((p) => p.phi));
    expect(exec.timeStep).toBe(shadow.timeStep);
  });

  it('EXEC message-passing differs from SHADOW linear', () => {
    const exec = ukhfKernelForward(phi0, K, 'EXEC', DEFAULT_CAUSAL_FIELD_DYNAMICS, {
      execDynamics: 'MESSAGE_PASSING_STUB',
    });
    const shadow = ukhfKernelForward(phi0, K, 'SHADOW', DEFAULT_CAUSAL_FIELD_DYNAMICS);
    const diff = Math.abs(
      (exec.particles[0]?.phi ?? 0) - (shadow.particles[0]?.phi ?? 0),
    );
    expect(diff).toBeGreaterThan(1e-9);
  });
});
