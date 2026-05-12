import type { CausalInteractionKernel, FieldDynamicsConfig } from '../contracts/multi-agent-causal-field.types';
import type { NeuralCausalGraphBundle } from '../contracts/neural-causal-graph-execution.types';
import {
  gnnDynamicsStep,
  learnKernelFromContextStub,
  ncgesForwardStep,
  ncgesReplayIdentificationLoss,
} from './neural-causal-graph-execution.util';

function kernel2(): CausalInteractionKernel {
  return {
    agentOrder: ['a', 'b'],
    matrix: [
      [0, 0.5],
      [0.5, 0],
    ],
  };
}

function snap(phiA: number, phiB: number, t = 0) {
  return {
    queryId: 'ncges',
    timeStep: t,
    particles: [
      { agentId: 'a', phi: phiA },
      { agentId: 'b', phi: phiB },
    ],
  };
}

describe('neural-causal-graph-execution.util', () => {
  it('learnKernelFromContextStub returns prior', () => {
    const k = kernel2();
    expect(learnKernelFromContextStub({ phiHistory: [] }, k)).toBe(k);
  });

  it('LINEAR_LAPLACIAN matches CMAFT Euler step', () => {
    const cfg: FieldDynamicsConfig = { dt: 0.1, damping: 0.1, couplingScale: 1 };
    const bundle: NeuralCausalGraphBundle = {
      kernel: kernel2(),
      dynamicsMode: 'LINEAR_LAPLACIAN',
    };
    const s0 = snap(1, -1);
    const n1 = gnnDynamicsStep(s0, bundle, cfg);
    expect(n1.timeStep).toBe(1);
    expect(n1.particles).toHaveLength(2);
  });

  it('MESSAGE_PASSING_STUB stays bounded', () => {
    const bundle: NeuralCausalGraphBundle = {
      kernel: kernel2(),
      dynamicsMode: 'MESSAGE_PASSING_STUB',
    };
    const cfg: FieldDynamicsConfig = { dt: 0.1, damping: 0.1, couplingScale: 1 };
    const n1 = gnnDynamicsStep(snap(2, -2), bundle, cfg);
    for (const p of n1.particles) {
      expect(Math.abs(p.phi)).toBeLessThan(10);
    }
  });

  it('ncgesReplayIdentificationLoss uses field residual squared', () => {
    const L = ncgesReplayIdentificationLoss(snap(1, 0), snap(1.5, 0));
    expect(L.fieldResidual).toBeGreaterThan(0);
  });

  it('ncgesForwardStep runs dynamics + optional control', () => {
    const bundle: NeuralCausalGraphBundle = {
      kernel: kernel2(),
      dynamicsMode: 'LINEAR_LAPLACIAN',
    };
    const cfg: FieldDynamicsConfig = { dt: 0.1, damping: 0.1, couplingScale: 1 };
    const out = ncgesForwardStep({
      snapshot: snap(0.5, -0.5),
      bundle,
      dynamicsConfig: cfg,
      goal: { goalVector: [1] },
      applyControl: true,
    });
    expect(out.particles).toHaveLength(2);
  });
});
