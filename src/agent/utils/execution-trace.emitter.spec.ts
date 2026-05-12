import {
  ExecutionTraceEmitter,
  attachExecutionTraceToResponse,
  newExecutionTraceId,
} from './execution-trace.emitter';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

describe('ExecutionTraceEmitter', () => {
  it('emits steps and seals deterministic shape', () => {
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
      invalidationScope: 'NONE',
      confidenceGate: 'HIGH',
      reuseArtifact: true,
    };
    const emitter = new ExecutionTraceEmitter({
      traceId: 'tid',
      artifactId: 'aid',
      decision,
      engine: 'SYSTEM1',
      provenance: {},
      confidence: {
        score: 1,
        band: 'HIGH',
        factors: { eligibilityPrior: 1, anomalyPenalty: 0, timeDecayFactor: 1 },
      },
      anomalies: [],
    });
    emitter.emit({ type: 'ECPS_EVAL', input: {}, output: decision });
    const sealed = emitter.seal();
    expect(sealed.traceId).toBe('tid');
    expect(sealed.steps).toHaveLength(1);
    expect(sealed.steps[0].type).toBe('ECPS_EVAL');
    expect(newExecutionTraceId()).toHaveLength(36);
  });

  it('attachExecutionTraceToResponse merges observability', () => {
    const resp: RouteAndRunResponseDto = {
      request_id: 'r',
      route: {} as RouteAndRunResponseDto['route'],
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] } as RouteAndRunResponseDto['explain'],
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
      },
    };
    attachExecutionTraceToResponse(resp, {
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
        invalidationScope: 'NONE',
        confidenceGate: 'HIGH',
      },
      engine: 'SYSTEM1',
      steps: [],
      provenance: {},
      confidence: {
        score: 1,
        band: 'HIGH',
        factors: { eligibilityPrior: 1, anomalyPenalty: 0, timeDecayFactor: 1 },
      },
      anomalies: [],
      timestamp: 1,
    });
    expect(resp.observability.execution_trace?.traceId).toBe('t');
  });
});
