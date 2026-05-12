import type { ExecutionTrace } from '../contracts/execution-trace.types';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import { compilePolicy } from './execution-policy.compiler';
import { interpretExecutionPolicyIR } from './execution-policy.interpreter';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';

function baseCtx(): ExecutionControlContext {
  return {
    artifactId: 'a',
    replayConfidence: {
      score: 0.95,
      band: 'HIGH',
      factors: {
        eligibilityPrior: 1,
        anomalyPenalty: 0,
        timeDecayFactor: 1,
      },
    },
    replayEligibility: 'FULL',
    anomalies: [],
    freshness: {},
    provenance: {},
  };
}

describe('compilePolicy + interpretExecutionPolicyIR', () => {
  it('default compile matches HIGH reuse decision', () => {
    const ir = compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {});
    const d = interpretExecutionPolicyIR(baseCtx(), ir);
    expect(d.mode).toBe('REUSE');
    expect(d.kernel).toBe('REFLEX_KERNEL');
  });

  it('raises reuse floor when traces contain replay violations', () => {
    const tr: ExecutionTrace = {
      traceId: 't',
      artifactId: 'x',
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
        {
          stepId: 's',
          type: 'TOOL_CALL',
          input: {},
          output: {},
        },
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
    const irNoTrace = compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {});
    const irTrace = compilePolicy([tr], DEFAULT_ECPS_RUNTIME_BIAS, {});
    expect(irTrace.thresholds.replayConfidenceHigh).toBeGreaterThan(irNoTrace.thresholds.replayConfidenceHigh);
    expect(irTrace.rules.length).toBeGreaterThan(0);
  });

  it('respects replayReuseFloorBounds constraint', () => {
    const ir = compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {
      replayReuseFloorBounds: { min: 0.9, max: 0.95 },
    });
    expect(ir.thresholds.replayConfidenceHigh).toBeGreaterThanOrEqual(0.9);
    expect(ir.thresholds.replayConfidenceHigh).toBeLessThanOrEqual(0.95);
  });
});
