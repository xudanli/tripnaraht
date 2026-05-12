import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import {
  buildPhiSnapshotFromEcpsDecision,
  buildSpclSampleShadowOnlyFromEcpsPreview,
  DEFAULT_CAUSAL_FIELD_DYNAMICS,
  deltaPhiShadowFromNcgesPreview,
  ncgesLinearPreviewFromExecutionDecision,
  ncgesObservabilityPreview,
  toyKernelIntensityEntropyCoupling,
} from './cognitive-execution-pipeline.util';

function decision(): ExecutionDecision {
  return {
    mode: 'RECOMPUTE',
    kernel: 'REASONING_KERNEL',
    features: {
      intensity: 0.72,
      entropy: 0.41,
      determinism: 0.5,
      toolDepth: 'HIGH',
    },
    toolDepth: 'HIGH',
    reuseArtifact: false,
    invalidationScope: 'FULL',
    confidenceGate: 'LOW',
  };
}

describe('cognitive-execution-pipeline.util', () => {
  it('buildPhiSnapshotFromEcpsDecision maps intensity and entropy', () => {
    const s = buildPhiSnapshotFromEcpsDecision(decision(), 'q');
    expect(s.particles).toHaveLength(2);
    expect(s.particles[0]?.phi).toBeCloseTo(0.72);
    expect(s.particles[1]?.phi).toBeCloseTo(0.41);
  });

  it('ncgesLinearPreview advances timeStep', () => {
    const r = ncgesLinearPreviewFromExecutionDecision(decision(), 'q');
    expect(r.snapshot1.timeStep).toBe(1);
  });

  it('ncgesObservabilityPreview returns schema', () => {
    const o = ncgesObservabilityPreview(decision(), 'aid');
    expect(o.schema).toBe('ncges/preview/v1');
    expect(o.phi_before).toHaveLength(2);
    expect(o.phi_after).toHaveLength(2);
  });

  it('deltaPhiShadowFromNcgesPreview matches row-wise deltas', () => {
    const o = ncgesObservabilityPreview(decision(), 'aid');
    const d = deltaPhiShadowFromNcgesPreview(o);
    expect(Object.keys(d).length).toBeGreaterThan(0);
  });

  it('buildSpclSampleShadowOnlyFromEcpsPreview pairs exec zeros with shadow', () => {
    const s = buildSpclSampleShadowOnlyFromEcpsPreview(decision(), 'aid');
    expect(Object.keys(s.deltaPhiShadow).length).toBeGreaterThan(0);
    expect(s.deltaPhiExec.aggregate_intensity).toBe(0);
  });

  it('ncgesLinearPreview respects explicit Kθ', () => {
    const toy = toyKernelIntensityEntropyCoupling();
    const zeroK: CausalInteractionKernel = {
      agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
      matrix: [
        [0, 0],
        [0, 0],
      ],
    };
    const rToy = ncgesLinearPreviewFromExecutionDecision(decision(), 'q', DEFAULT_CAUSAL_FIELD_DYNAMICS, toy);
    const rZero = ncgesLinearPreviewFromExecutionDecision(decision(), 'q', DEFAULT_CAUSAL_FIELD_DYNAMICS, zeroK);
    expect(rZero.snapshot1.particles[0]?.phi).not.toBeCloseTo(rToy.snapshot1.particles[0]!.phi, 5);
  });
});
