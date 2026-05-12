import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import {
  applyPolicyCorrectionSignals,
  derivePolicyCorrectionSignals,
  resetEcpsRuntimeBias,
} from './policy-correction-kernel.util';
import { analyzeExecutionTrace } from './trace-analyzer.util';

describe('policy-correction-kernel', () => {
  it('derivePolicyCorrectionSignals emits OVER_REACTIVITY on routing deviation', () => {
    const expected: ExecutionDecision = {
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
    };
    const trace: ExecutionTrace = {
      traceId: 't',
      artifactId: 'a',
      decision: expected,
      engine: 'SYSTEM2_REACT',
      steps: [
        {
          stepId: 's1',
          type: 'ENGINE_SELECT',
          input: {},
          output: { kernel: 'REFLEX_KERNEL', engine: 'SYSTEM1', profile: {} },
        },
      ],
      provenance: {},
      confidence: {
        score: 0.5,
        band: 'LOW',
        factors: {
          eligibilityPrior: 0.5,
          anomalyPenalty: 0,
          timeDecayFactor: 1,
        },
      },
      anomalies: [],
      timestamp: 1,
    };
    const analysis = analyzeExecutionTrace({ expectedDecision: expected, trace });
    const signals = derivePolicyCorrectionSignals(analysis);
    expect(signals.some((s) => s.type === 'OVER_REACTIVITY')).toBe(true);
  });

  it('applyPolicyCorrectionSignals tightens replay threshold on OVER_REUSE signal', () => {
    const base = resetEcpsRuntimeBias();
    const next = applyPolicyCorrectionSignals(base, [
      {
        type: 'OVER_REUSE',
        severity: 'CRITICAL',
        suggestedAdjustment: 'INCREASE_REPLAY_CONFIDENCE_THRESHOLD',
      },
    ]);
    expect(next.replayThresholdShift).toBeLessThan(base.replayThresholdShift);
  });
});
