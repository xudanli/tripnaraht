import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import { analyzeExecutionTrace } from './trace-analyzer.util';

function traceStub(overrides: Partial<ExecutionTrace>): ExecutionTrace {
  const decision: ExecutionDecision = {
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
  };
  return {
    traceId: 't1',
    artifactId: 'a1',
    decision,
    engine: 'SYSTEM1',
    steps: [],
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
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('analyzeExecutionTrace', () => {
  it('detects routing deviation when ENGINE_SELECT disagrees with expected ECPS kernel', () => {
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
    const t = traceStub({
      engine: 'SYSTEM2_REACT',
      decision: expected,
      steps: [
        {
          stepId: 's1',
          type: 'ENGINE_SELECT',
          input: {},
          output: { kernel: 'REFLEX_KERNEL', engine: 'SYSTEM1', profile: {} },
        },
      ],
    });
    const r = analyzeExecutionTrace({ expectedDecision: expected, trace: t });
    expect(r.deviationSignals.some((d) => d.kind === 'ROUTING_DEVIATION')).toBe(true);
  });

  it('flags replay violation when REUSE plan contains tool calls', () => {
    const expected: ExecutionDecision = {
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
    };
    const t = traceStub({
      decision: expected,
      steps: [
        {
          stepId: 's1',
          type: 'TOOL_CALL',
          input: {},
          output: {},
          metadata: { toolName: 'x' },
        },
      ],
    });
    const r = analyzeExecutionTrace({ expectedDecision: expected, trace: t });
    expect(r.deviationSignals.some((d) => d.kind === 'REPLAY_VIOLATION')).toBe(true);
  });
});
