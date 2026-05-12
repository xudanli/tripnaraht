/**
 * HTTP E2E (deterministic stub) for opening-hours hard rule.
 *
 * Goal:
 * - A "museum closed on Monday" schedule must be materialized as HARD proof:
 *   DecisionLog.metadata.rule_id = temporal_opening_v1
 *   metadata.details.evidence.type = opening_hours
 * - Fact derivation must turn it into a HARD Fact for contract/QA.
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
import { deriveFactsFromMetadata } from '../trips/decision/shared/fact-derivation.util';
import { DecisionKernelService } from '../decision/kernel/decision-kernel.service';
import { VerifyExecutorService } from './execution/verify-executor.service';
import { SkillsRegistryService } from '../skills/services/skills-registry.service';
import { ItineraryVerifySkill } from '../skills/itinerary/itinerary-verify.skill';
import { RouteFeasibilityEngineService } from './services/route-feasibility-engine.service';
import { HotspotRegistryService } from '../skills/world/services/hotspot-registry.service';

describe('POST /agent/route_and_run — opening hours hard rule (E2E)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prevUseClaudeEnv: string | undefined;

  const mockRouterService = { route: jest.fn() };
  const mockAgentStateService = {
    createInitialState: jest.fn().mockImplementation((_userInput: string, _userId: string, tripId?: string, options?: any) => ({
      request_id: `test-${Date.now()}`,
      user_input: '',
      trip: { trip_id: tripId || null, days: 1, day_boundaries: [{ start: '08:00', end: '22:00' }], pacing: 'normal' },
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
      request_id: 'e2e-opening-hours',
      current_step: 'VERIFY',
      trip_plan_request: { request_id: 'e2e-opening-hours', origin: 'A', destination: 'B' },
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

    const deterministicClaudeOrchestrator = {
      orchestrateWithStateMachine: jest.fn().mockImplementation(async (req: any) => {
        const now = new Date().toISOString();
        const day = '2026-06-01'; // Monday

        const itinerary = {
          request_id: req.request_id ?? 'e2e-opening-hours',
          days: [
            {
              date: day,
              items: [
                {
                  id: 'item_museum_1',
                  type: 'POI',
                  start_window: '10:00',
                  end_window: '12:00',
                  location_ref: { place_id: 'poi_museum_1', name: 'Museum' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
              ],
            },
          ],
          action_plan: [],
        };

        // Ground-truth loop: derive the conflict from raw research data via real Kernel.executeVerify.
        const research_data = {
          opening_hours_evidence: [
            {
              poi_id: 'poi_museum_1',
              opening_hours: 'Closed',
              is_open_now: false,
              evidence_id: 'opening_hours_poi_museum_1_stub',
            },
          ],
        };

        const merge = (current: any, patch: any) => ({
          ...current,
          ...patch,
          tripState: { ...(current.tripState ?? {}), ...(patch.tripState ?? {}) },
          systemState: { ...(current.systemState ?? {}), ...(patch.systemState ?? {}) },
        });
        const kernel = new DecisionKernelService(
          { merge, commit: jest.fn(), appendHistoryDelta: jest.fn(), commitWithLock: jest.fn() } as any,
          { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
          { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
          { buildContextPackage: jest.fn() } as any,
          { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
          undefined,
          undefined,
          undefined,
          // Real VerifyExecutor wired with real itinerary.verify skill (opening-hours scan).
          new VerifyExecutorService(
            (() => {
              const reg = new SkillsRegistryService();
              reg.registerSkill(new ItineraryVerifySkill() as any);
              return reg;
            })(),
            undefined,
            // Use RouteFeasibilityEngine to produce structured POI_CLOSED issue.
            new RouteFeasibilityEngineService(
              (() => {
                const reg = new SkillsRegistryService();
                reg.registerSkill(new ItineraryVerifySkill() as any);
                return reg;
              })(),
              undefined,
              undefined,
              undefined,
            ),
          ) as any,
          undefined,
        );
        const dso: any = {
          requestId: req.request_id ?? 'e2e-opening-hours',
          userIntent: {},
          environmentState: {},
          tripState: { planDraft: itinerary },
          confidence: 0.9,
          systemState: { requestId: req.request_id ?? 'e2e-opening-hours', version: 0, startedAt: now, lastUpdatedAt: now },
        };
        const ctx: any = {
          requestId: req.request_id ?? 'e2e-opening-hours',
          itinerary,
          tripPlanRequest: { destination: 'IS', date_range: { start_date: day, end_date: day } },
          gateResult: { gate_result: 'ADJUST_REQUIRED', violations: [], required_adjustments: [], confidence: 0.6 },
          researchData: research_data,
        };
        const verifyResult = await kernel.executeVerify(dso, ctx);
        const hasConflict = Array.isArray(verifyResult.issues) && verifyResult.issues.some((i: any) => i.code === 'POI_CLOSED');

        const k3Log: any[] = [
          {
            step: 'VERIFY',
            timestamp: now,
            inputs_summary: 'Kernel VERIFY: decisionKernel.executeVerify → issues → materialize evidence',
            outputs_summary: hasConflict ? 'POI_CLOSED: Museum' : '验证通过',
            evidence_refs: ['opening_hours_poi_museum_1_stub'],
            metadata: hasConflict
              ? {
                  rule_id: 'temporal_opening_v1',
                  details: {
                    evidence: {
                      type: 'opening_hours',
                      source: 'KERNEL_FEASIBILITY_ENGINE',
                      poi_id: 'poi_museum_1',
                      date: day,
                      timezone: 'UTC',
                      planned_start: `${day}T10:00:00.000Z`,
                      planned_end: `${day}T12:00:00.000Z`,
                      open_window: 'Closed',
                      is_violated: true,
                      item_id: 'item_museum_1',
                    },
                  },
                }
              : undefined,
          },
        ];

        return baseOrchestrationResult({
          answerText: 'opening hours conflict',
          stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
          decisionLog: k3Log,
          result: {
            state: baseState({ current_step: 'VERIFY', decision_log: k3Log, itinerary, plan_version: 1 } as any),
            gate_result: { gate_result: 'ADJUST_REQUIRED', violations: [], required_adjustments: [], confidence: 0.6, evidence_refs: [] },
            itinerary,
          },
        });
      }),
      orchestrate: jest.fn(),
    };

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
        { provide: ClaudeOrchestratorService, useValue: deterministicClaudeOrchestrator },
        {
          provide: HotspotRegistryService,
          useValue: {
            observeRequest: () => undefined,
            listActivePairs: () => [],
            decideBucketMinutes: () => 5,
            markPolled: () => undefined,
            recordSnapshot: () => undefined,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (prevUseClaudeEnv === undefined) delete process.env.USE_CLAUDE_ORCHESTRATION;
    else process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    if (app) await app.close();
    if (moduleRef) await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestDeduplication.checkDuplicate.mockReturnValue(null);
  });

  it('emits temporal_opening_v1 opening_hours evidence and derives HARD fact', async () => {
    const body = {
      request_id: 'e2e-opening-hours',
      user_id: 'u1',
      trip_id: 'trip-e2e',
      message: 'plan museum visit',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
      },
    };

    const response = await request(app.getHttpServer()).post('/agent/route_and_run').send(body).expect(200);
    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);

    const orch = response.body.result.payload.orchestrationResult;
    const logs = orch?.state?.decision_log ?? orch?.decision_log ?? [];
    expect(Array.isArray(logs)).toBe(true);

    const v = logs.find((l: any) => l?.metadata?.rule_id === 'temporal_opening_v1');
    expect(v).toBeTruthy();
    expect(v?.metadata?.details?.evidence?.type).toBe('opening_hours');
    expect(v?.metadata?.details?.evidence?.open_window).toBe('Closed');
    expect(v?.metadata?.details?.evidence?.source).toBe('KERNEL_FEASIBILITY_ENGINE');
    expect(v?.metadata?.details?.evidence?.is_violated).toBe(true);

    const facts = deriveFactsFromMetadata({
      metadata: v?.metadata ?? {},
      reasonCodes: ['temporal_opening_v1'],
      timestampIso: v?.timestamp,
    });
    expect(facts.some((f) => f.rule_id === 'temporal_opening_v1' && f.severity === 'HARD' && f.is_violated === true)).toBe(
      true,
    );
  });
});

