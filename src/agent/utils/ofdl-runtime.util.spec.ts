import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import { DEFAULT_CAUSAL_FIELD_DYNAMICS } from './cognitive-execution-pipeline.util';
import { causalOperatorFieldFromKernel } from './coft-ei-operator-field.util';
import {
  applyOfdlOperator,
  ofdlHelloWorldDualProjection,
  resolveOfdlMode,
} from './ofdl-runtime.util';

const K: CausalInteractionKernel = {
  agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
  matrix: [
    [0, 0.35],
    [0.35, 0],
  ],
};

const phi: CausalFieldSnapshot = {
  queryId: 'q',
  timeStep: 0,
  particles: [
    { agentId: 'aggregate_intensity', phi: 0.7 },
    { agentId: 'aggregate_entropy', phi: 0.35 },
  ],
};

describe('ofdl-runtime.util', () => {
  it('resolveOfdlMode maps SIMULATE to linear EXEC', () => {
    expect(resolveOfdlMode('SIMULATE')).toEqual({
      ukhfMode: 'EXEC',
      execDynamics: 'LINEAR_LAPLACIAN',
    });
  });

  it('resolveOfdlMode maps SHADOW to UKHF SHADOW', () => {
    expect(resolveOfdlMode('SHADOW')).toEqual({ ukhfMode: 'SHADOW' });
  });

  it('ofdlHelloWorldDualProjection: EXEC vs SHADOW gives nonnegative ε metrics', () => {
    const field = causalOperatorFieldFromKernel(K);
    const r = ofdlHelloWorldDualProjection(phi, field, DEFAULT_CAUSAL_FIELD_DYNAMICS, 'EXEC');
    expect(r.phiExec.timeStep).toBe(1);
    expect(r.phiShadow.timeStep).toBe(1);
    expect(r.spclError.l2Norm).toBeGreaterThanOrEqual(0);
  });

  it('SIMULATE exec branch matches SHADOW linear path => ~zero structural ε', () => {
    const field = causalOperatorFieldFromKernel(K);
    const r = ofdlHelloWorldDualProjection(phi, field, DEFAULT_CAUSAL_FIELD_DYNAMICS, 'SIMULATE');
    expect(r.spclError.maxAbsEpsilon).toBeLessThan(1e-9);
  });

  it('applyOfdlOperator REACT advances state', () => {
    const field = causalOperatorFieldFromKernel(K);
    const next = applyOfdlOperator(field, phi, 'REACT', DEFAULT_CAUSAL_FIELD_DYNAMICS);
    expect(next.timeStep).toBe(1);
  });
});
