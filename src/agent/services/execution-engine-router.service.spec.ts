import { ExecutionEngineRouterService } from './execution-engine-router.service';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { ExecutionTraceEmitter } from '../utils/execution-trace.emitter';
import { projectKernelToLegacyTier } from '../utils/legacy-execution-projection.util';

function decisionForKernel(kernel: ExecutionKernel): ExecutionDecision {
  return {
    mode: 'RECOMPUTE',
    kernel,
    features: {
      intensity: 0.82,
      entropy: 0.48,
      determinism: 0.55,
      toolDepth: 'HIGH',
    },
    toolDepth: 'HIGH',
    invalidationScope: 'FULL',
    confidenceGate: 'LOW',
  };
}

function req(): RouteAndRunRequestDto {
  return {
    request_id: 'r',
    user_id: 'u',
    trip_id: 't',
    message: 'm',
  } as RouteAndRunRequestDto;
}

async function ok(): Promise<RouteAndRunResponseDto> {
  return {
    request_id: 'r',
    route: {} as RouteAndRunResponseDto['route'],
    result: { status: 'OK', answer_text: '', payload: {} },
    explain: { decision_log: [] } as RouteAndRunResponseDto['explain'],
    observability: {
      latency_ms: 0,
      router_ms: 0,
      system_mode: 'SYSTEM1',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
    },
  };
}

describe('ExecutionEngineRouterService', () => {
  const router = new ExecutionEngineRouterService();

  it('resolveProfile maps capabilities for REASONING kernel → react runner projection', () => {
    const d = decisionForKernel('REASONING_KERNEL');
    const p = router.resolveProfile(d);
    expect(p.kernel).toBe('REASONING_KERNEL');
    expect(p.engine).toBe('SYSTEM2_REACT');
    expect(p.capabilities.toolLoop).toBe(true);
    expect(p.capabilities.openEndedReasoning).toBe(true);
  });

  it('run dispatches to the matching runner', async () => {
    const calls: string[] = [];
    const runners = {
      system1: async () => {
        calls.push('s1');
        return ok();
      },
      lightweightQa: async () => {
        calls.push('lw');
        return ok();
      },
      system2React: async () => {
        calls.push('react');
        return ok();
      },
      system2StateMachine: async () => {
        calls.push('sm');
        return ok();
      },
    };
    await router.run(decisionForKernel('REFLEX_KERNEL'), req(), undefined, runners, undefined);
    expect(calls).toEqual(['s1']);
    await router.run(decisionForKernel('LIGHTWEIGHT_KERNEL'), req(), undefined, runners);
    expect(calls).toEqual(['s1', 'lw']);
  });

  it('run with traceEmitter records ENGINE_SELECT step', async () => {
    const d = decisionForKernel('REASONING_KERNEL');
    const emitter = new ExecutionTraceEmitter({
      traceId: 'trace-1',
      artifactId: 'art',
      decision: d,
      engine: projectKernelToLegacyTier(d.kernel),
      provenance: {},
      confidence: {
        score: 0.5,
        band: 'LOW',
        factors: { eligibilityPrior: 0.5, anomalyPenalty: 0, timeDecayFactor: 1 },
      },
      anomalies: [],
    });
    await router.run(
      d,
      req(),
      undefined,
      {
        system1: ok,
        lightweightQa: ok,
        system2React: ok,
        system2StateMachine: ok,
      },
      emitter,
    );
    const sealed = emitter.seal();
    expect(sealed.steps.some((s) => s.type === 'ENGINE_SELECT')).toBe(true);
  });

  it('assertDecisionContract rejects missing kernel', () => {
    expect(() =>
      router.assertDecisionContract({
        mode: 'RECOMPUTE',
        kernel: undefined as unknown as ExecutionKernel,
        features: {
          intensity: 0.5,
          entropy: 0.5,
          determinism: 0.5,
          toolDepth: 'HIGH',
        },
        toolDepth: 'HIGH',
        invalidationScope: 'FULL',
        confidenceGate: 'INVALID',
      }),
    ).toThrow('ECPS_CONTRACT_MISSING_KERNEL');
  });
});
