import { Test } from '@nestjs/testing';
import { ExecutionGatewayService } from './execution-gateway.service';
import { AgentService } from './agent.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';
import { PolicyAgentPopulationService } from './policy-agent-population.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { RuntimeReplayPersistenceService } from './runtime-replay-persistence.service';

describe('ExecutionGatewayService', () => {
  const agentStub = {} as AgentService;

  it('returns null when dedup absent', async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        { provide: RequestDeduplicationService, useValue: { checkDuplicate: jest.fn().mockReturnValue(null) } },
      ],
    }).compile();
    const gw = mod.get(ExecutionGatewayService);
    const req = {
      request_id: 'a',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: {},
    } as RouteAndRunRequestDto;
    expect(
      gw.tryAdmitDedupReplay({
        request: req,
        requestHash: 'h',
        startTime: Date.now(),
        deadline: { totalMs: 1000, remainingMs: () => 500 },
      }),
    ).toBeNull();
    await mod.close();
  });

  it('admits when cache hit and ECPS allows reuse', async () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    const cached = {
      request_id: 'old',
      route: { route: 'SYSTEM1_RAG' },
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        replay_cache_provenance: { generatedAt: Date.now() },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn().mockReturnValue(cached) },
        },
      ],
    }).compile();
    const gw = mod.get(ExecutionGatewayService);
    const req = {
      request_id: 'new',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: { trace_compatibility_mode: 'legacy' as const },
    } as RouteAndRunRequestDto;
    const out = gw.tryAdmitDedupReplay({
      request: req,
      requestHash: 'h',
      startTime: Date.now(),
      deadline: { totalMs: 1000, remainingMs: () => 500 },
    });
    expect(out).not.toBeNull();
    expect(out!.response.request_id).toBe('new');
    expect(out!.response.observability.execution_trace?.steps.map((s) => s.type)).toEqual([
      'ECPS_EVAL',
      'ARTIFACT_READ',
    ]);
    expect(out!.response.observability.cognitive_thermodynamics?.delta_e).toBeDefined();
    expect(out!.response.observability.cognitive_thermodynamics?.conservation_residual).toBeLessThan(1e-6);
    expect(out!.response.observability.information_geometry?.schema_version).toBe('igl/v1');
    expect(out!.response.observability.information_geometry?.path_energy).toBeGreaterThanOrEqual(0);
    expect(out!.response.observability.variational_cognitive_physics?.schema_version).toBe('vcpos/v1');
    expect(out!.response.observability.variational_cognitive_physics?.discrete_action).toBeDefined();
    delete process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
    await mod.close();
  });

  it('attaches ncges_preview when COGNITIVE_NCGES_PREVIEW=1', async () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    process.env.COGNITIVE_NCGES_PREVIEW = '1';
    const cached = {
      request_id: 'old',
      route: { route: 'SYSTEM1_RAG' },
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        replay_cache_provenance: { generatedAt: Date.now() },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn().mockReturnValue(cached) },
        },
      ],
    }).compile();
    const gw = mod.get(ExecutionGatewayService);
    const req = {
      request_id: 'new',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: { trace_compatibility_mode: 'legacy' as const },
    } as RouteAndRunRequestDto;
    const out = gw.tryAdmitDedupReplay({
      request: req,
      requestHash: 'h',
      startTime: Date.now(),
      deadline: { totalMs: 1000, remainingMs: () => 500 },
    });
    expect(out).not.toBeNull();
    expect(
      (out!.response.observability as { ncges_preview?: { schema?: string } }).ncges_preview?.schema,
    ).toBe('ncges/preview/v1');
    expect(
      (out!.response.observability as { ncges_preview?: { phi_before?: unknown[] } }).ncges_preview?.phi_before,
    ).toHaveLength(2);
    delete process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
    delete process.env.COGNITIVE_NCGES_PREVIEW;
    await mod.close();
  });

  it('attaches MAPE / PV-ER observability when policy agent population is present', async () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    const cached = {
      request_id: 'old',
      route: { route: 'SYSTEM1_RAG' },
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        replay_cache_provenance: { generatedAt: Date.now() },
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        EcpsRuntimeBiasService,
        PolicyAgentPopulationService,
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn().mockReturnValue(cached) },
        },
      ],
    }).compile();
    await moduleRef.init();

    const gw = moduleRef.get(ExecutionGatewayService);
    const req = {
      request_id: 'new',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: { trace_compatibility_mode: 'legacy' as const },
    } as RouteAndRunRequestDto;
    const out = gw.tryAdmitDedupReplay({
      request: req,
      requestHash: 'h',
      startTime: Date.now(),
      deadline: { totalMs: 1000, remainingMs: () => 500 },
    });
    expect(out).not.toBeNull();
    expect(out!.response.observability.active_execution_policy_version_id).toEqual(expect.any(String));
    expect(out!.response.observability.active_policy_agent_id).toEqual(expect.any(String));
    expect(typeof out!.response.observability.policy_selection_score).toBe('number');
    expect(out!.response.observability.cognitive_thermodynamics?.delta_e).toBeDefined();
    expect(out!.response.observability.information_geometry?.path_energy).toBeGreaterThanOrEqual(0);
    expect(out!.response.observability.variational_cognitive_physics?.mean_lagrangian_density).toBeDefined();

    delete process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
    await moduleRef.close();
  });

  it('calls persistDedupReplayAnchor when RUNTIME_REPLAY_PERSISTENCE is on', async () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    process.env.RUNTIME_REPLAY_PERSISTENCE = '1';
    const persistDedup = jest.fn().mockResolvedValue(undefined);
    const cached = {
      request_id: 'old',
      route: { route: 'SYSTEM1_RAG' },
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        replay_cache_provenance: { generatedAt: Date.now() },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn().mockReturnValue(cached) },
        },
        {
          provide: RuntimeReplayPersistenceService,
          useValue: { persistDedupReplayAnchor: persistDedup },
        },
      ],
    }).compile();
    const gw = mod.get(ExecutionGatewayService);
    const req = {
      request_id: 'new',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: { trace_compatibility_mode: 'legacy' as const },
    } as RouteAndRunRequestDto;
    gw.tryAdmitDedupReplay({
      request: req,
      requestHash: 'hash123',
      startTime: Date.now(),
      deadline: { totalMs: 1000, remainingMs: () => 500 },
    });
    expect(persistDedup).toHaveBeenCalledWith({
      request: req,
      requestHash: 'hash123',
      response: expect.objectContaining({ request_id: 'new' }),
    });
    delete process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
    delete process.env.RUNTIME_REPLAY_PERSISTENCE;
    await mod.close();
  });

  it('returns null when request memory snapshot ≠ cached execution_trace_v1.snapshot_id', async () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    const cached = {
      request_id: 'old',
      route: { route: 'SYSTEM1_RAG' },
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        replay_cache_provenance: { generatedAt: Date.now() },
        trace: {
          execution_trace_v1: {
            schemaId: 'agent.orchestration.execution_trace@v1',
            version: 1,
            snapshot_id: 'snap-cached',
          },
          execution_semantic_fingerprint_v1: 'b'.repeat(40),
        },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn().mockReturnValue(cached) },
        },
      ],
    }).compile();
    const gw = mod.get(ExecutionGatewayService);
    const req = {
      request_id: 'new',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: { trace_compatibility_mode: 'legacy' as const },
      __memoryExecutionBinding: { snapshot_id: 'snap-fresh', snapshot_version: 1 },
    } as RouteAndRunRequestDto;
    expect(
      gw.tryAdmitDedupReplay({
        request: req,
        requestHash: 'h',
        startTime: Date.now(),
        deadline: { totalMs: 1000, remainingMs: () => 500 },
      }),
    ).toBeNull();
    delete process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
    await mod.close();
  });

  it('returns null under cid-aware when cached OK trace lacks execution_semantic_fingerprint_v1', async () => {
    process.env.CONFIDENCE_DEDUP_GATE_DISABLED = '1';
    const cached = {
      request_id: 'old',
      route: { route: 'SYSTEM1_RAG' },
      result: { status: 'OK', answer_text: '', payload: {} },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM1',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        replay_cache_provenance: { generatedAt: Date.now() },
        trace: {
          execution_trace_v1: {
            schemaId: 'agent.orchestration.execution_trace@v1',
            version: 1,
            snapshot_id: '00000000-0000-4000-8000-000000000001',
          },
        },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
        {
          provide: RequestDeduplicationService,
          useValue: { checkDuplicate: jest.fn().mockReturnValue(cached) },
        },
      ],
    }).compile();
    const gw = mod.get(ExecutionGatewayService);
    const req = {
      request_id: 'new',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: {},
    } as RouteAndRunRequestDto;
    expect(
      gw.tryAdmitDedupReplay({
        request: req,
        requestHash: 'h',
        startTime: Date.now(),
        deadline: { totalMs: 1000, remainingMs: () => 500 },
      }),
    ).toBeNull();
    delete process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
    await mod.close();
  });
});
