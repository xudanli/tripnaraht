import type {
  CausalFieldSnapshot,
  CausalInteractionKernel,
  FieldDynamicsConfig,
} from '../contracts/multi-agent-causal-field.types';
import {
  aggregateFieldPotential,
  applyFieldPerturbation,
  evolveCausalFieldOneStep,
  fieldReconstructionResidual,
  laplacianFromInfluenceMatrix,
  learningKernelFitStub,
  systemIdentificationResidual,
} from './multi-agent-causal-field.util';

function kernel2(): CausalInteractionKernel {
  return {
    agentOrder: ['a', 'b'],
    matrix: [
      [0, 0.5],
      [0.5, 0],
    ],
  };
}

function snap(phiA: number, phiB: number, t = 0): CausalFieldSnapshot {
  return {
    queryId: 'ft',
    timeStep: t,
    particles: [
      { agentId: 'a', phi: phiA },
      { agentId: 'b', phi: phiB },
    ],
  };
}

describe('multi-agent-causal-field.util', () => {
  it('aggregateFieldPotential sums φ', () => {
    expect(aggregateFieldPotential(snap(1, 2))).toBe(3);
  });

  it('evolveCausalFieldOneStep updates Φ under K', () => {
    const cfg: FieldDynamicsConfig = { dt: 0.1, damping: 0.1, couplingScale: 1 };
    const next = evolveCausalFieldOneStep(snap(1, -1), kernel2(), cfg);
    expect(next.timeStep).toBe(1);
    expect(next.particles).toHaveLength(2);
  });

  it('applyFieldPerturbation adds δφ', () => {
    const p = applyFieldPerturbation(snap(0, 0), { a: 0.25 });
    expect(p.particles.find((x) => x.agentId === 'a')?.phi).toBe(0.25);
  });

  it('fieldReconstructionResidual measures mismatch', () => {
    const r = fieldReconstructionResidual(snap(1, 0), snap(1.5, 0));
    expect(r.residualL2).toBeGreaterThan(0);
    expect(r.diagnosis).toBeDefined();
  });

  it('laplacianFromInfluenceMatrix builds D_row − K', () => {
    const K = kernel2().matrix;
    const L = laplacianFromInfluenceMatrix(K);
    expect(L[0][0]).toBeCloseTo(0.5);
    expect(L[0][1]).toBeCloseTo(-0.5);
    expect(L[1][0]).toBeCloseTo(-0.5);
    expect(L[1][1]).toBeCloseTo(0.5);
  });

  it('systemIdentificationResidual aliases field reconstruction', () => {
    const a = fieldReconstructionResidual(snap(2, 2), snap(2.5, 2));
    const b = systemIdentificationResidual(snap(2, 2), snap(2.5, 2));
    expect(a.residualL2).toBe(b.residualL2);
  });

  it('learningKernelFitStub returns prior kernel', () => {
    const k = kernel2();
    const r = learningKernelFitStub({ priorKernel: k });
    expect(r.kernel).toBe(k);
    expect(r.converged).toBe(true);
  });
});
