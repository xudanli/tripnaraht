/**
 * AgentService.routeAndRun — Option B+ 恢复闭环（指数退避）
 *
 * 模拟 MCP 工具类超时（LIVE_TOOL_TIMEOUT）→ I5 TIMEOUT 域 → RETRY_WITH_EXPONENTIAL_BACKOFF；
 * 固定 computeBackoffDelayMs / sleepMs，断言 observability 中保留退避轨迹。
 *
 * 注意：AgentService 对 CLAUDE_SM 使用 CircuitBreaker(3)，连续 3 次失败后第 4 次会在
 * orchestrate 之前短路为 BREAKER_OPEN，因此本用例采用「2 次失败后成功」以同时覆盖退避与熔断共存。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { ExecutionGatewayService } from './execution-gateway.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import * as executionRecoveryPolicy from '../../chain-of-work/execution/execution-recovery-policy.util';
import * as routeAndRunRecovery from '../utils/route-and-run-recovery.util';
import { validateRouteAndRunRecoveryTraceContract } from '../contracts/route-and-run-recovery-trace.contract';
import { ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS } from '../memory/testing/route-and-run-memory.providers';

describe('AgentService.routeAndRun — recovery backoff (LIVE_TOOL_TIMEOUT)', () => {
  let agentService: AgentService;
  let module: TestingModule;
  let prevUseClaudeEnv: string | undefined;

  const mockRouterService = { route: jest.fn() };
  const mockAgentStateService = {
    createInitialState: jest.fn().mockImplementation((userInput: string, userId: string, tripId?: string, options?: any) => ({
      request_id: `test-${Date.now()}`,
      user_input: userInput,
      trip: { trip_id: tripId || null, days: 1, day_boundaries: [{ start: '10:00', end: '22:00' }], lunch_break: { enabled: true, duration_min: 60, window: ['11:30', '13:30'] }, pacing: 'normal' },
      draft: { nodes: [], hard_nodes: [], soft_nodes: [], edits: [] },
      memory: { semantic_facts: { pois: [], rules: {} }, episodic_snippets: [], user_profile: {} },
      compute: { clusters: null, time_matrix_api: null, time_matrix_robust: null, optimization_results: [], robustness: null },
      react: { step: 0, max_steps: options?.max_steps || 8, observations: [], decision_log: [] },
      result: { status: 'DRAFT' as const, timeline: [], dropped_items: [], explanations: [] },
      observability: { router_ms: 0, latency_ms: 0, tool_calls: 0, browser_steps: 0, cost_est_usd: 0, fallback_used: false },
    })),
    getState: jest.fn(),
    update: jest.fn().mockImplementation((requestId: string, updates: any) => {
      const base = mockAgentStateService.createInitialState('', '', null);
      return {
        ...base,
        request_id: requestId,
        ...updates,
        result: { ...base.result, ...(updates.result || {}) },
        observability: { ...base.observability, ...(updates.observability || {}) },
      };
    }),
  };
  const mockSystem1Executor = { execute: jest.fn() };
  const mockOrchestrator = { execute: jest.fn() };
  const mockEventTelemetry = { recordRouterDecision: jest.fn(), recordAgentComplete: jest.fn() };
  const mockRequestDeduplication = {
    generateRequestHash: jest.fn(),
    getCachedResponse: jest.fn(),
    cacheResponse: jest.fn(),
    checkDuplicate: jest.fn(),
  };

  const mockClaudeOrchestrator = {
    orchestrateWithStateMachine: jest.fn(),
    orchestrate: jest.fn(),
  };

  function baseOrchestrationResult(overrides: Partial<OrchestrationResult> = {}): OrchestrationResult {
    return {
      success: true,
      answerText: 'ok-after-retry',
      stepsExecuted: [],
      totalDuration: 0,
      decisionLog: [],
      result: {},
      ...overrides,
    };
  }

  function baseState(partial: Partial<OrchestratorState>): OrchestratorState {
    return {
      request_id: 'recovery-bplus',
      current_step: 'DONE',
      trip_plan_request: { request_id: 'recovery-bplus', origin: 'A', destination: 'B' },
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
      ...partial,
    } as OrchestratorState;
  }

  let backoffSpy: jest.SpyInstance;
  let sleepSpy: jest.SpyInstance;

  beforeAll(async () => {
    prevUseClaudeEnv = process.env.USE_CLAUDE_ORCHESTRATION;
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';

    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        ...ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS,
        ExecutionGatewayService,
        AgentService,
        { provide: RouterService, useValue: mockRouterService },
        { provide: AgentStateService, useValue: mockAgentStateService },
        { provide: System1ExecutorService, useValue: mockSystem1Executor },
        { provide: OrchestratorService, useValue: mockOrchestrator },
        { provide: EventTelemetryService, useValue: mockEventTelemetry },
        { provide: RequestDeduplicationService, useValue: mockRequestDeduplication },
        { provide: ClaudeOrchestratorService, useValue: mockClaudeOrchestrator },
      ],
    }).compile();

    agentService = module.get<AgentService>(AgentService);
  });

  afterAll(async () => {
    if (prevUseClaudeEnv === undefined) {
      delete process.env.USE_CLAUDE_ORCHESTRATION;
    } else {
      process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    }
    await module.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestDeduplication.checkDuplicate.mockReturnValue(null);
    // 小延迟 + 固定序列，避免触发 routeAndRun 内「remainingMs <= delayMs + 800」提前终止第三次重试
    backoffSpy = jest
      .spyOn(executionRecoveryPolicy, 'computeBackoffDelayMs')
      .mockImplementation((idx: number) => [50, 100, 200][idx] ?? 50);
    sleepSpy = jest.spyOn(routeAndRunRecovery, 'sleepMs').mockResolvedValue(undefined as unknown as void);
  });

  afterEach(() => {
    backoffSpy.mockRestore();
    sleepSpy.mockRestore();
  });

  function recoveryRequest(): RouteAndRunRequestDto {
    return {
      request_id: 'recovery-bplus',
      user_id: 'u1',
      trip_id: 'trip-recovery-bplus',
      message: '第二天景点路线',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
        max_seconds: 90,
      },
    };
  }

  it('指数退避：多次 LIVE_TOOL_TIMEOUT 后成功时，observability 含 recovery_trace 与 attempts', async () => {
    const smBreaker = (agentService as any).breakerSM as { onFailure: (e: unknown) => void };
    const onFailureSpy = jest.spyOn(smBreaker, 'onFailure');

    const errTimeout = new Error('MCP tool failed: LIVE_TOOL_TIMEOUT');
    let smCalls = 0;
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockImplementation(async () => {
      smCalls += 1;
      if (smCalls <= 2) {
        throw errTimeout;
      }
      return baseOrchestrationResult({
        answerText: 'recovered',
        stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 0 }],
        result: {
          state: baseState({
            current_step: 'DONE',
            plan_version: 1,
            decision_log: [
              {
                request_id: 'recovery-bplus',
                step: 'VERIFY' as any,
                actor: 'Orchestrator' as any,
                inputs_summary: '',
                outputs_summary: '',
                evidence_refs: [],
                timestamp: new Date().toISOString(),
                metadata: {},
              },
            ],
          }),
          itinerary: { request_id: 'recovery-bplus', days: [] } as any,
        },
      });
    });

    const res = await agentService.routeAndRun(recoveryRequest());

    expect(smCalls).toBe(3);
    expect(mockClaudeOrchestrator.orchestrateWithStateMachine).toHaveBeenCalledTimes(3);
    // Recovery 隔离计费：退避重试中的多次失败不应累加 SM 熔断计数
    expect(onFailureSpy).not.toHaveBeenCalled();
    onFailureSpy.mockRestore();

    const obs = res.observability as {
      recovery_trace?: Array<{
        attempt: number;
        backoff_ms: number;
        failure_code?: string;
        elapsed_ms?: number;
        recorded_at?: string;
      }>;
      recovery_retry_attempts?: number;
      mode_final?: string;
    };

    expect(obs.mode_final).toBe('CLAUDE_SM');
    expect(obs.recovery_retry_attempts).toBe(2);
    expect(obs.recovery_trace).toHaveLength(2);
    expect(obs.recovery_trace?.map((t) => t.attempt)).toEqual([1, 2]);
    expect(obs.recovery_trace?.map((t) => t.backoff_ms)).toEqual([50, 100]);
    expect(obs.recovery_trace?.every((t) => t.failure_code === 'LIVE_TOOL_TIMEOUT')).toBe(true);
    expect(obs.recovery_trace?.every((t) => typeof t.elapsed_ms === 'number')).toBe(true);
    expect(obs.recovery_trace?.every((t) => typeof t.recorded_at === 'string')).toBe(true);

    const gate = validateRouteAndRunRecoveryTraceContract(obs, { requireWallClockFields: true });
    expect(gate.valid).toBe(true);
    expect(gate.errors).toEqual([]);

    expect(sleepSpy).toHaveBeenCalledTimes(2);
    expect(backoffSpy).toHaveBeenCalled();
  });
});
