import type { ExecutionTrace } from '../contracts/execution-trace.types';
import {
  computeVariationalCognitivePhysicsSnapshot,
  lagrangianDensity,
} from './variational-cognitive-physics.util';

describe('variational-cognitive-physics.util (VCPO)', () => {
  it('computes discrete action from metric edges + L=E+λS−W', () => {
    const tr: ExecutionTrace = {
      traceId: 't',
      artifactId: 'a',
      decision: {
        mode: 'REUSE',
        kernel: 'REFLEX_KERNEL',
        features: {
          intensity: 0.12,
          entropy: 0.05,
          determinism: 0.93,
          toolDepth: 'NONE',
        },
        toolDepth: 'NONE',
        reuseArtifact: true,
        invalidationScope: 'NONE',
        confidenceGate: 'HIGH',
      },
      engine: 'SYSTEM1',
      steps: [
        { stepId: '1', type: 'ECPS_EVAL', input: {}, output: {} },
        { stepId: '2', type: 'ARTIFACT_READ', input: {}, output: {} },
      ],
      provenance: {},
      confidence: {
        score: 0.95,
        band: 'HIGH',
        factors: {
          eligibilityPrior: 1,
          anomalyPenalty: 0,
          timeDecayFactor: 1,
        },
      },
      anomalies: [],
      timestamp: 1,
    };

    const snap = computeVariationalCognitivePhysicsSnapshot({ trace: tr, lambdaEntropy: 0.62 });
    expect(snap.schema_version).toBe('vcpos/v1');
    expect(snap.segment_count).toBe(2);
    expect(Number.isFinite(snap.discrete_action)).toBe(true);
    expect(Number.isFinite(snap.mean_lagrangian_density)).toBe(true);
  });

  it('lagrangianDensity follows E + λS − W', () => {
    const L = lagrangianDensity({
      metricEnergy: 0.5,
      entropyDensity: 0.4,
      workDensity: 0.3,
      lambdaEntropy: 1,
    });
    expect(L).toBeCloseTo(0.5 + 0.4 - 0.3);
  });
});
