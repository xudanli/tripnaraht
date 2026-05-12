import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import {
  causalWorldFrom,
  causalWorldStructuralDivergence,
  evaluateAccessibility,
  modalExecutionBand,
  modalTransitionKernelStub,
  worldsModallyEquivalent,
  worldAlignmentDivergence,
} from './mcut-modal-universe.util';

const K: CausalInteractionKernel = {
  agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
  matrix: [
    [0, 0.3],
    [0.3, 0],
  ],
};

function phi(ts: number, a: number, b: number): CausalFieldSnapshot {
  return {
    queryId: 'q',
    timeStep: ts,
    particles: [
      { agentId: 'aggregate_intensity', phi: a },
      { agentId: 'aggregate_entropy', phi: b },
    ],
  };
}

describe('mcut-modal-universe.util', () => {
  it('causalWorldStructuralDivergence penalizes kernel mismatch', () => {
    const w1 = causalWorldFrom('w1', phi(0, 0.5, 0.5), K);
    const K2 = { ...K, matrix: [...K.matrix.map((r) => [...r])] };
    K2.matrix[0]![1] = 0.99;
    const w2 = causalWorldFrom('w2', phi(0, 0.5, 0.5), K2);
    const d = causalWorldStructuralDivergence(w1, w2);
    expect(d.kernelAligned).toBe(false);
    expect(d.structuralDivergence).toBeGreaterThan(d.phiDivergenceRms);
  });

  it('evaluateAccessibility yields high score for identical worlds', () => {
    const w = causalWorldFrom('x', phi(0, 0.6, 0.4), K);
    const a = evaluateAccessibility(w, w);
    expect(a.accessibilityScore).toBeCloseTo(1, 5);
    expect(a.accessibleUnderThreshold).toBe(true);
  });

  it('modalTransitionKernelStub carries operator tag', () => {
    const w1 = causalWorldFrom('a', phi(0, 0.5, 0.5), K);
    const w2 = causalWorldFrom('b', phi(1, 0.52, 0.51), K);
    const k = modalTransitionKernelStub(w1, w2, 'EXEC/UKHF');
    expect(k.operatorTag).toBe('EXEC/UKHF');
    expect(k.probabilityMass).toBeGreaterThan(0);
  });

  it('worldAlignmentDivergence small when exec/shadow share Φ lattice', () => {
    const we = causalWorldFrom('e', phi(1, 0.55, 0.45), K);
    const ws = causalWorldFrom('s', phi(1, 0.54, 0.46), K);
    expect(worldAlignmentDivergence(we, ws)).toBeGreaterThan(0);
    expect(worldAlignmentDivergence(we, we)).toBe(0);
  });

  it('worldsModallyEquivalent respects epsilon', () => {
    const w1 = causalWorldFrom('1', phi(0, 0.5, 0.5), K);
    const w2 = causalWorldFrom('2', phi(0, 0.51, 0.5), K);
    expect(worldsModallyEquivalent(w1, w2, 0.2)).toBe(true);
  });

  it('modalExecutionBand maps divergent worlds', () => {
    const w1 = causalWorldFrom('a', phi(0, 0.5, 0.5), K);
    const w2 = causalWorldFrom('b', phi(0, 0.9, 0.9), K);
    const acc = evaluateAccessibility(w1, w2, { divergenceThreshold: 0.05 });
    expect(modalExecutionBand(acc)).not.toBe('NEAR_WORLD');
  });
});
