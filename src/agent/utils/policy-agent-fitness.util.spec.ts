import type { ExecutionTrace } from '../contracts/execution-trace.types';
import { computeFitnessFromExecutionTraces } from './policy-agent-fitness.util';

describe('computeFitnessFromExecutionTraces', () => {
  it('returns defaults for empty trace list', () => {
    const f = computeFitnessFromExecutionTraces([]);
    expect(f.successRate).toBe(1);
    expect(f.latency).toBe(0);
  });

  it('penalizes deviations and anomalies from ETK', () => {
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
        {
          stepId: 's',
          type: 'TOOL_CALL',
          input: {},
          output: {},
          metadata: { latencyMs: 50 },
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
      anomalies: [{ code: 'x', severity: 'ERROR', category: 'SEMANTIC_DRIFT', message: 'm' }],
      timestamp: 1,
    };
    const f = computeFitnessFromExecutionTraces([tr]);
    expect(f.replayStability).toBeLessThan(1);
    expect(f.latency).toBe(50);
  });
});
