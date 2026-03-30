/**
 * AO P0 — route_and_run 端到端（HTTP + 真实 AgentService）
 *
 * 不 mock `AgentService.routeAndRun`：仅替换 `ClaudeOrchestratorService`，走完整
 * routePolicy → CLAUDE_SM → routeAndRunWithClaudeStateMachine → Controller 出口。
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
import { RouterService } from './services/router.service';
import { AgentStateService } from './services/agent-state.service';
import { System1ExecutorService } from './services/system1-executor.service';
import { OrchestratorService } from './services/orchestrator.service';
import { EventTelemetryService } from './services/event-telemetry.service';
import { RequestDeduplicationService } from './services/request-deduplication.service';
import { ClaudeOrchestratorService } from './services/claude-orchestrator.service';
import type { OrchestrationResult } from './interfaces/claude-orchestration.interface';
import type { OrchestratorState } from './interfaces/trip-plan.interface';
import { summarizeP1RouteAndRunValidation } from './contracts/p1-route-and-run-validators';
import { alternativesReadabilityIssues } from '../trips/decision/contracts/alternatives-min-contract';

describe('POST /agent/route_and_run — AO P0 E2E (real AgentService)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
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
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 0,
      decisionLog: [],
      result: {},
      ...overrides,
    };
  }

  function baseState(partial: Partial<OrchestratorState>): OrchestratorState {
    return {
      request_id: 'ao-p0-e2e',
      current_step: 'GATE_EVAL',
      trip_plan_request: { request_id: 'ao-p0-e2e', origin: 'A', destination: 'B' },
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

  beforeAll(async () => {
    prevUseClaudeEnv = process.env.USE_CLAUDE_ORCHESTRATION;
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [AgentController],
      providers: [
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

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (prevUseClaudeEnv === undefined) {
      delete process.env.USE_CLAUDE_ORCHESTRATION;
    } else {
      process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    }
    await app.close();
    await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestDeduplication.checkDuplicate.mockReturnValue(null);
  });

  const aoP0Body = () => ({
    request_id: 'ao-p0-e2e',
    user_id: 'u1',
    trip_id: 'trip-ao-p0-e2e',
    message: '查询第二天景点路线',
    options: {
      use_claude_orchestration: true,
      use_state_machine_orchestration: true,
      dry_run: true,
    },
  });

  it('真实 routeAndRun：gate_result=BLOCK 经 HTTP 透出', async () => {
    const alts = {
      alternative_pois: [
        {
          poi_id: 'alt-p1',
          name: '备选景点',
          reason: '主路线不可达时的可执行替代',
          evidence_status: 'UNVERIFIED' as const,
        },
      ],
      alternative_routes: [] as [],
    };
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        result: {
          state: baseState({
            current_step: 'GATE_EVAL',
            alternatives: alts,
            gate_result: {
              gate_result: 'BLOCK',
              violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
              required_adjustments: [],
              confidence: 0.9,
              evidence_refs: [],
            },
          }),
          gate_result: {
            gate_result: 'BLOCK',
            violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
            required_adjustments: [],
            confidence: 0.9,
            evidence_refs: [],
          },
        },
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send(aoP0Body())
      .expect(200);

    const orch = response.body.result.payload.orchestrationResult;
    expect(orch?.state?.gate_result?.gate_result).toBe('BLOCK');
    expect(orch?.gate_result?.gate_result).toBe('BLOCK');
    expect(mockClaudeOrchestrator.orchestrateWithStateMachine).toHaveBeenCalled();

    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);
    expect(alternativesReadabilityIssues(orch?.state?.alternatives)).toHaveLength(0);
  });

  it('真实 routeAndRun：gate_result=ADJUST_REQUIRED 经 HTTP 透出且通过 P1 校验', async () => {
    const adjustGate = {
      gate_result: 'ADJUST_REQUIRED' as const,
      violations: [{ type: 'TIME_CONFLICT' as const, severity: 'SOFT' as const, detail: 'day2 window tight' }],
      required_adjustments: [{ action: 'ADD_BUFFER' as const, why: '增加 30 分钟缓冲' }],
      confidence: 0.55,
      evidence_refs: [] as string[],
    };
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        result: {
          state: baseState({
            current_step: 'GATE_EVAL',
            gate_result: adjustGate,
          }),
          gate_result: adjustGate,
        },
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send(aoP0Body())
      .expect(200);

    const st = response.body.result.payload.orchestrationResult?.state;
    expect(st?.gate_result?.gate_result).toBe('ADJUST_REQUIRED');
    expect(response.body.result.payload.orchestrationResult?.gate_result?.gate_result).toBe('ADJUST_REQUIRED');

    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);
    expect(p1.allErrors).toHaveLength(0);
  });

  it('真实 routeAndRun：VERIFY→REPAIR 与 explain.decision_log 经 HTTP 透出', async () => {
    const ts = new Date().toISOString();
    const decisionLog = [
      {
        request_id: 'ao-p0-e2e',
        step: 'VERIFY' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'itinerary.verify',
        outputs_summary: '发现约束冲突',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
      {
        request_id: 'ao-p0-e2e',
        step: 'REPAIR' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'repair.apply',
        outputs_summary: '已应用修复',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
    ];
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        decisionLog,
        result: {
          state: baseState({
            current_step: 'REPAIR',
            errors: [],
            decision_log: decisionLog,
          }),
          decision_log: decisionLog,
        },
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send(aoP0Body())
      .expect(200);

    const stepsExplain = response.body.explain.decision_log.map((e: { step: string }) => e.step);
    expect(stepsExplain).toContain('VERIFY');
    expect(stepsExplain).toContain('REPAIR');
    expect(response.body.result.payload.orchestrationResult.state.current_step).toBe('REPAIR');
    const stepsPayload = response.body.result.payload.orchestrationResult.decision_log.map(
      (e: { step: string }) => e.step,
    );
    expect(stepsPayload).toEqual(stepsExplain);

    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);
    expect(p1.allErrors).toHaveLength(0);
  });

  it('真实 routeAndRun：ALLOW + itinerary 经 HTTP 透出且通过 P1 校验', async () => {
    const ts = new Date().toISOString();
    const decisionLog = [
      {
        request_id: 'ao-p0-e2e',
        step: 'PLAN_GEN' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'plan',
        outputs_summary: 'ok',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
    ];
    const itinerary = {
      request_id: 'ao-p0-e2e',
      days: [
        {
          date: '2026-07-01',
          items: [
            {
              id: 'i1',
              type: 'POI' as const,
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { name: 'Hallgrímskirkja' },
              evidence_refs: ['ev-1'],
              verified: true,
            },
          ],
        },
      ],
    };
    const allowGate = {
      gate_result: 'ALLOW' as const,
      violations: [] as [],
      required_adjustments: [] as [],
      confidence: 1,
      evidence_refs: [] as string[],
    };
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        decisionLog,
        result: {
          state: baseState({
            current_step: 'PLAN_GEN',
            decision_log: decisionLog,
            gate_result: allowGate,
            itinerary,
          }),
          decision_log: decisionLog,
          gate_result: allowGate,
          itinerary,
        },
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/agent/route_and_run')
      .send(aoP0Body())
      .expect(200);

    const st = response.body.result.payload.orchestrationResult?.state;
    expect(st?.gate_result?.gate_result).toBe('ALLOW');
    expect(st?.itinerary?.days?.[0]?.items?.[0]?.location_ref?.name).toBe('Hallgrímskirkja');

    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);
    expect(p1.allErrors).toHaveLength(0);
  });
});
