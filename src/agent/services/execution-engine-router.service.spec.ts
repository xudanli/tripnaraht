import { ExecutionEngineRouterService, EngineContractAdapter } from './execution-engine-router.service';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { ExecutionTraceEmitter } from '../utils/execution-trace.emitter';
import { projectKernelToLegacyTier } from '../utils/legacy-execution-projection.util';
import { buildAgentTurnContract } from '../contracts/agent-turn-contract.v1';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';

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

function minimalMemory(overrides: Partial<AgentMemoryContext> = {}): AgentMemoryContext {
  return {
    snapshotId: 'snap',
    snapshotVersion: 1,
    requestId: 'r',
    userId: 'u',
    tripId: 't',
    userProfile: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    loadedAt: '2026-05-13T00:00:00.000Z',
    observability: { layers: [] },
    ...overrides,
  };
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

  describe('EngineContractAdapter', () => {
    it('validateContract skips when __agentTurnContract absent', () => {
      expect(EngineContractAdapter.validateContract(req())).toEqual({ status: 'skipped', reason: 'no_contract' });
    });

    it('validateContract ok when request matches sealed contract', () => {
      const request = {
        ...req(),
        options: { execution_model_runtime_hint: 'replay_session_a' },
      } as RouteAndRunRequestDto;
      (request as any).__agentTurnContract = buildAgentTurnContract({
        request,
        memory: minimalMemory(),
      });
      const v = EngineContractAdapter.validateContract(request);
      expect(v.status).toBe('ok');
      if (v.status === 'ok') {
        expect(v.policy_applied).toBeDefined();
      }
    });

    it('validateContract mismatch when runtime hint drifts', () => {
      const request = {
        ...req(),
        options: { execution_model_runtime_hint: 'A' },
      } as RouteAndRunRequestDto;
      (request as any).__agentTurnContract = buildAgentTurnContract({
        request: { ...request, options: { execution_model_runtime_hint: 'B' } } as RouteAndRunRequestDto,
        memory: minimalMemory(),
      });
      const v = EngineContractAdapter.validateContract(request);
      expect(v.status).toBe('mismatch');
      if (v.status === 'mismatch') {
        expect(v.issues).toContain('execution_model_runtime_hint_drift');
      }
    });

    it('run throws ENGINE_CONTRACT_MISMATCH when contract drifts', async () => {
      const request = {
        ...req(),
        options: { execution_model_runtime_hint: 'stable' },
      } as RouteAndRunRequestDto;
      (request as any).__agentTurnContract = buildAgentTurnContract({
        request,
        memory: minimalMemory(),
      });
      request.options = { execution_model_runtime_hint: 'changed' };
      await expect(
        router.run(decisionForKernel('REFLEX_KERNEL'), request, undefined, {
          system1: ok,
          lightweightQa: ok,
          system2React: ok,
          system2StateMachine: ok,
        }),
      ).rejects.toThrow('ENGINE_CONTRACT_MISMATCH');
    });
  });
});
