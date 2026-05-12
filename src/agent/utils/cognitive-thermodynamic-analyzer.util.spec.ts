import type { ExecutionTrace } from '../contracts/execution-trace.types';
import {
  analyzeCognitiveThermodynamics,
  estimateDeltaE,
} from './cognitive-thermodynamic-analyzer.util';

describe('cognitive-thermodynamic-analyzer', () => {
  it('conservation holds (ΔE ≈ W + S + loss)', () => {
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

    const snap = analyzeCognitiveThermodynamics({
      trace: tr,
      latencyMs: 120,
      decision: tr.decision,
      deviationCount: 0,
    });

    expect(snap.conservation_residual).toBeLessThan(1e-9);
    expect(snap.work + snap.entropy + snap.loss).toBeCloseTo(snap.delta_e);
  });

  it('REUSE + reflex kernel yields lower estimateDeltaE than reasoning kernel + HIGH depth', () => {
    const base = {
      latencyMs: 500,
    };
    const low = estimateDeltaE({
      ...base,
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
    });
    const high = estimateDeltaE({
      ...base,
      decision: {
        mode: 'RECOMPUTE',
        kernel: 'REASONING_KERNEL',
        features: {
          intensity: 0.88,
          entropy: 0.55,
          determinism: 0.38,
          toolDepth: 'HIGH',
        },
        toolDepth: 'HIGH',
        reuseArtifact: false,
        invalidationScope: 'FULL',
        confidenceGate: 'LOW',
      },
    });
    expect(low).toBeLessThan(high);
  });
});
