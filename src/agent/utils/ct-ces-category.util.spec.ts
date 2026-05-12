import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import { DEFAULT_CAUSAL_FIELD_DYNAMICS } from './cognitive-execution-pipeline.util';
import { causalOperatorFieldFromKernel } from './coft-ei-operator-field.util';
import {
  causalDiagramSquareResidual,
  composeCausalMorphisms,
  naturalTransformationSpclSample,
  witnessDiagramCommutativity,
} from './ct-ces-category.util';

const K: CausalInteractionKernel = {
  agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
  matrix: [
    [0, 0.35],
    [0.35, 0],
  ],
};

const phi0: CausalFieldSnapshot = {
  queryId: 'q',
  timeStep: 0,
  particles: [
    { agentId: 'aggregate_intensity', phi: 0.7 },
    { agentId: 'aggregate_entropy', phi: 0.35 },
  ],
};

describe('ct-ces-category.util', () => {
  it('composeCausalMorphisms applies mode sequence', () => {
    const field = causalOperatorFieldFromKernel(K);
    const twoStep = composeCausalMorphisms(field, phi0, ['SHADOW', 'SHADOW'], DEFAULT_CAUSAL_FIELD_DYNAMICS);
    expect(twoStep.timeStep).toBe(2);
  });

  it('causalDiagramSquareResidual compares exec vs shadow from same Φ₀', () => {
    const field = causalOperatorFieldFromKernel(K);
    const r = causalDiagramSquareResidual(field, phi0, DEFAULT_CAUSAL_FIELD_DYNAMICS, 'EXEC');
    expect(r.phiExec.timeStep).toBe(1);
    expect(r.phiShadow.timeStep).toBe(1);
    expect(r.squareResidualRms).toBeGreaterThanOrEqual(0);
  });

  it('witnessDiagramCommutativity marks local commute under threshold', () => {
    const field = causalOperatorFieldFromKernel(K);
    const w = witnessDiagramCommutativity(
      field,
      phi0,
      DEFAULT_CAUSAL_FIELD_DYNAMICS,
      'SIMULATE',
      1e-6,
    );
    expect(w.schema).toBe('ct-ces/diagram-witness/v1');
    expect(w.locallyCommutative).toBe(true);
  });

  it('naturalTransformationSpclSample returns paired deltas', () => {
    const field = causalOperatorFieldFromKernel(K);
    const s = naturalTransformationSpclSample(field, phi0, DEFAULT_CAUSAL_FIELD_DYNAMICS, 'EXEC');
    expect(Object.keys(s.deltaPhiExec).length).toBeGreaterThan(0);
  });
});
