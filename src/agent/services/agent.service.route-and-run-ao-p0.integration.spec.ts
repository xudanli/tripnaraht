/**
 * AgentService.routeAndRun — AO P0 组装层集成（真实 AgentService + mock ClaudeOrchestrator）
 *
 * 验证：routePolicy → CLAUDE_SM → routeAndRunWithClaudeStateMachine 映射到
 * result.payload.orchestrationResult（gate_result / VERIFY errors），不经 HTTP。
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
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { summarizeP1RouteAndRunValidation } from '../contracts/p1-route-and-run-validators';
import { alternativesReadabilityIssues } from '../../trips/decision/contracts/alternatives-min-contract';

describe('AgentService.routeAndRun — AO P0 (CLAUDE_SM assembly)', () => {
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
      request_id: 'ao-p0-asm',
      current_step: 'GATE_EVAL',
      trip_plan_request: { request_id: 'ao-p0-asm', origin: 'A', destination: 'B' },
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

    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
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
  });

  function aoP0Request(): RouteAndRunRequestDto {
    return {
      request_id: 'ao-p0-asm',
      user_id: 'u1',
      trip_id: 'trip-ao-p0',
      message: '查询第二天景点路线',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
      },
    };
  }

  it('将 gate_result=BLOCK 映射到 payload.orchestrationResult', async () => {
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

    const res = await agentService.routeAndRun(aoP0Request());

    expect((res.observability as { mode_final?: string }).mode_final).toBe('CLAUDE_SM');
    const orch = res.result.payload.orchestrationResult;
    expect(orch?.state?.gate_result?.gate_result).toBe('BLOCK');
    expect(orch?.gate_result?.gate_result).toBe('BLOCK');
    expect(orch?.state?.gate_result?.violations?.[0]?.detail).toBe('blocked');
    expect(res.observability.gate_block_rate).toBe(1);
    expect(mockClaudeOrchestrator.orchestrateWithStateMachine).toHaveBeenCalled();

    const p1 = summarizeP1RouteAndRunValidation(res as unknown);
    expect(p1.valid).toBe(true);
    expect(alternativesReadabilityIssues(orch?.state?.alternatives)).toHaveLength(0);
  });

  it('将 gate_result=NEED_USER_CONFIRM 与 readiness 映射到 payload', async () => {
    const needConfirmGate = {
      gate_result: 'NEED_USER_CONFIRM' as const,
      violations: [],
      required_adjustments: [],
      confidence: 0.7,
      evidence_refs: [],
      readiness_questions: [
        {
          ruleId: 'date-rule',
          questions: [{ id: 'q1', text: '确认出发日期？' }],
          category: 'LOGISTICS',
          severity: 'SOFT',
        },
      ],
    };
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        result: {
          state: baseState({
            current_step: 'GATE_EVAL',
            gate_result: needConfirmGate,
          }),
          gate_result: needConfirmGate,
        },
      }),
    );

    const res = await agentService.routeAndRun(aoP0Request());
    const orch = res.result.payload.orchestrationResult;
    expect(orch?.gate_result?.gate_result).toBe('NEED_USER_CONFIRM');
    expect(orch?.gate_result?.readiness_questions?.[0]?.ruleId).toBe('date-rule');
    expect(orch?.gate_result?.readiness_questions?.[0]?.questions?.[0]?.text).toContain('出发日期');
  });

  it('将 gate_result=ADJUST_REQUIRED 映射到 payload 且通过 P1 校验', async () => {
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

    const res = await agentService.routeAndRun(aoP0Request());
    const orch = res.result.payload.orchestrationResult;
    expect(orch?.state?.gate_result?.gate_result).toBe('ADJUST_REQUIRED');
    expect(orch?.gate_result?.required_adjustments?.[0]?.why).toContain('缓冲');

    const p1 = summarizeP1RouteAndRunValidation(res as unknown);
    expect(p1.valid).toBe(true);
    expect(p1.allErrors).toHaveLength(0);
  });

  it('AO-04 diversity: alternatives include tradeoffs (utility differs, drift risk differs)', async () => {
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        result: {
          state: baseState({
            current_step: 'DONE',
            itinerary: { request_id: 'ao-p0-asm', days: [] } as any,
            gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9, evidence_refs: [] } as any,
          }),
          itinerary: { request_id: 'ao-p0-asm', days: [] } as any,
          gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9, evidence_refs: [] } as any,
          decisionState: {
            optimizationHints: {
              method: 'CGUS',
              recommendedAlternativeId: 'plan-a-experience',
              alternatives: [
                {
                  // Plan A: higher utility, higher drift probability (lower feasibilityProbability)
                  id: 'plan-a-experience',
                  expectedUtility: 0.92,
                  feasibilityProbability: 0.65,
                  summary: '体验极高，但风险更大（更容易发生漂移）',
                  itinerary: { request_id: 'plan-a-experience', days: [], action_plan: [] },
                  violations: [{ type: 'TIME_SLACK_SOFT', severity: 'SOFT', degree: 0.6, detail: 'tight window' }],
                },
                {
                  // Plan B: lower utility, very robust (higher feasibilityProbability)
                  id: 'plan-b-robust',
                  expectedUtility: 0.78,
                  feasibilityProbability: 0.95,
                  summary: '更稳健，但体验略弱',
                  itinerary: { request_id: 'plan-b-robust', days: [], action_plan: [] },
                  violations: [{ type: 'EXPERIENCE_DENSITY_LOW', severity: 'SOFT', degree: 0.4, detail: 'less packed' }],
                },
              ],
            },
          },
        },
      }),
    );

    const res = await agentService.routeAndRun(aoP0Request());
    const alternatives = (res.result.payload as any).alternatives;
    expect(Array.isArray(alternatives)).toBe(true);

    // Assertion 1: alternatives.length >= 2
    expect(alternatives.length).toBeGreaterThanOrEqual(2);

    const planA = alternatives.find((c: any) => c?.candidate_id === 'plan-a-experience');
    const planB = alternatives.find((c: any) => c?.candidate_id === 'plan-b-robust');
    expect(planA).toBeTruthy();
    expect(planB).toBeTruthy();

    // Assertion 2: total_utility must differ
    expect(planA.score_breakdown?.total_utility).not.toBe(planB.score_breakdown?.total_utility);

    // Assertion 3: aggressive plan has higher probability_of_drift
    expect(planA.risk_profile?.probability_of_drift).toBeGreaterThan(planB.risk_profile?.probability_of_drift);
  });

  it('将仅 prompt、无 text 的 readiness 问题映射到 payload（与 executeGateEvalStep 注入一致）', async () => {
    const needConfirmGate = {
      gate_result: 'NEED_USER_CONFIRM' as const,
      violations: [],
      required_adjustments: [],
      confidence: 0.7,
      evidence_refs: [],
      readiness_questions: [
        {
          ruleId: 'visa-rule',
          questions: [{ id: 'q1', prompt: '是否需过境签？' }],
          category: 'COMPLIANCE',
          severity: 'HARD',
        },
      ],
    };
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        result: {
          state: baseState({
            current_step: 'GATE_EVAL',
            gate_result: needConfirmGate,
          }),
          gate_result: needConfirmGate,
        },
      }),
    );

    const res = await agentService.routeAndRun(aoP0Request());
    const orch = res.result.payload.orchestrationResult;
    const q = orch?.gate_result?.readiness_questions?.[0]?.questions?.[0];
    expect(orch?.gate_result?.gate_result).toBe('NEED_USER_CONFIRM');
    expect(q?.prompt).toContain('过境签');
    expect(q?.text).toBeUndefined();
  });

  it('将 VERIFY 步骤 errors 保留在 orchestrationResult.state', async () => {
    mockClaudeOrchestrator.orchestrateWithStateMachine.mockResolvedValue(
      baseOrchestrationResult({
        result: {
          state: baseState({
            current_step: 'VERIFY',
            errors: [
              {
                step: 'VERIFY',
                error_code: 'ITINERARY_CONSTRAINT',
                message: 'day overlap',
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        },
      }),
    );

    const res = await agentService.routeAndRun(aoP0Request());
    const st = res.result.payload.orchestrationResult?.state;
    expect(st?.current_step).toBe('VERIFY');
    expect(st?.errors?.[0]?.error_code).toBe('ITINERARY_CONSTRAINT');
    expect(st?.errors?.[0]?.message).toContain('overlap');
  });

  it('将 VERIFY→REPAIR 后的 state 与 decision_log 映射到 payload（AO-03 组装）', async () => {
    const ts = new Date().toISOString();
    const decisionLog = [
      {
        request_id: 'ao-p0-asm',
        step: 'VERIFY' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'itinerary.verify',
        outputs_summary: '发现约束冲突',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
      {
        request_id: 'ao-p0-asm',
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

    const res = await agentService.routeAndRun(aoP0Request());
    const orch = res.result.payload.orchestrationResult;
    expect(orch?.state?.current_step).toBe('REPAIR');
    const steps = orch?.state?.decision_log?.map((e) => e.step);
    expect(steps).toContain('VERIFY');
    expect(steps).toContain('REPAIR');
    expect(orch?.decision_log?.map((e) => e.step)).toEqual(steps);
    expect(res.explain.decision_log).toEqual(decisionLog);

    const p1 = summarizeP1RouteAndRunValidation(res as unknown);
    expect(p1.valid).toBe(true);
    expect(p1.allErrors).toHaveLength(0);
  });

  it('将 gate_result=ALLOW 与 itinerary 映射到 payload（AO-04 行程切片）', async () => {
    const ts = new Date().toISOString();
    const decisionLog = [
      {
        request_id: 'ao-p0-asm',
        step: 'PLAN_GEN' as const,
        actor: 'Orchestrator' as const,
        inputs_summary: 'plan',
        outputs_summary: 'ok',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
    ];
    const itinerary = {
      request_id: 'ao-p0-asm',
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
              metadata: {
                risk_level: 'MEDIUM' as const,
                risk_tags: ['SAFETY' as const, 'LOGISTICS' as const],
              },
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

    const res = await agentService.routeAndRun(aoP0Request());
    const st = res.result.payload.orchestrationResult?.state;
    expect(st?.gate_result?.gate_result).toBe('ALLOW');
    expect(st?.itinerary?.days?.[0]?.items?.[0]?.location_ref?.name).toBe('Hallgrímskirkja');
    expect(
      res.explain.simplified_explanation?.risk_tags_summary?.some((x) => x.tag === 'SAFETY'),
    ).toBe(true);
    expect(
      res.explain.ai_capability_display?.limitations?.some((l) => l.description.includes('风险标签摘要')),
    ).toBe(true);

    const p1 = summarizeP1RouteAndRunValidation(res as unknown);
    expect(p1.valid).toBe(true);
    expect(p1.allErrors).toHaveLength(0);
  });
});
