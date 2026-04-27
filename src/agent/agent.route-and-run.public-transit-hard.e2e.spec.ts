/**
 * HTTP E2E (deterministic stub) for PT-hard fact + C1 strict auto-heal.
 *
 * Goal:
 * - First plan uses TRANSIT and includes a CANCELLED PT hard fact -> EvidenceBundle FAILED under strict.
 * - System must auto-heal by re-planning without public transit and return a DRIVE itinerary with VERIFIED/PARTIAL evidence bundle.
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

describe('POST /agent/route_and_run — PT-hard fact strict auto-heal (E2E)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prevUseClaudeEnv: string | undefined;
  let prevStrictEb: string | undefined;

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
      request_id: 'e2e-pt-hard',
      current_step: 'VERIFY',
      trip_plan_request: { request_id: 'e2e-pt-hard', origin: 'A', destination: 'B' },
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
    prevStrictEb = process.env.C1_STRICT_EVIDENCE_BUNDLE;
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';
    process.env.C1_STRICT_EVIDENCE_BUNDLE = '1';

    const deterministicClaudeOrchestrator = {
      orchestrateWithStateMachine: jest.fn().mockImplementation(async (req: any) => {
        const now = new Date().toISOString();
        const isHeal = String(req?.meta?.pt_heal_retry ?? '') === '1' || String(req?.emergency_constraints?.reason_code ?? '') === 'HEALING_PT_HARD_FACT_FAILED';
        const scenario = String(req?.message ?? '').includes('transfer') ? 'TRANSFER' : 'CANCELLED';

        if (!isHeal) {
          // First attempt: TRANSIT plan with PT evidence (should fail strict and trigger auto-heal).
          const itinerary = {
            request_id: req.request_id ?? 'e2e-pt-hard',
            days: [
              {
                date: '2026-06-01',
                items: [
                  {
                    id: 'seg_transit_1',
                    type: 'TRANSIT',
                    start_window: '23:30',
                    end_window: '23:50',
                    location_ref: { place_id: 'seg_transit_1', name: 'Metro line 1' },
                    evidence_refs: [],
                    verified: false,
                    verification_status: 'ASSUMPTION',
                  },
                ],
              },
            ],
            action_plan: [],
          };

          const k3Log: any[] = [
            {
              step: 'VERIFY',
              timestamp: now,
              inputs_summary:
                scenario === 'TRANSFER'
                  ? 'PT verify: inject transfer window violation'
                  : 'PT verify: inject CANCELLED service status',
              outputs_summary: scenario === 'TRANSFER' ? 'TRANSIT transfer gap violated' : 'TRANSIT cancelled',
              evidence_refs: [],
              metadata: {
                rule_id: 'public_transport_v1',
                details: {
                  evidence: {
                    type: 'public_transit',
                    segmentId: 'seg_transit_1',
                    departureTime: '2026-06-01T23:30:00.000Z',
                    serviceStatus: scenario === 'TRANSFER' ? 'ACTIVE' : 'CANCELLED',
                    transferWindowMin: 6,
                    plannedTransferWindowMin: 2,
                    source: 'DETERMINISTIC_PT_STUB',
                    snapshotId: scenario === 'TRANSFER' ? 'pt_snap_transfer_1' : 'pt_snap_cancelled_1',
                    is_violated: true,
                  },
                },
              },
            },
          ];

          return baseOrchestrationResult({
            answerText: 'pt cancelled',
            stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
            decisionLog: k3Log,
            result: {
              state: baseState({
                current_step: 'VERIFY',
                decision_log: k3Log,
                itinerary,
                narration: {
                  user_friendly_summary: 'pt cancelled',
                  day_by_day_narrative: [],
                  highlights: [],
                  tips: [],
                  warnings: [
                    {
                      kind: 'iron_shield_evidence',
                      rule_id: 'public_transport_v1',
                      severity: 'HARD',
                      message:
                        scenario === 'TRANSFER'
                          ? 'Transit transfer gap below minimum'
                          : 'Transit service cancelled',
                      evidence: {
                        type: 'public_transit',
                        serviceStatus: scenario === 'TRANSFER' ? 'ACTIVE' : 'CANCELLED',
                        transferWindowMin: 6,
                        plannedTransferWindowMin: 2,
                        source: 'DETERMINISTIC_PT_STUB',
                      },
                    },
                  ],
                } as any,
              } as any),
              gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.7, evidence_refs: [] },
              itinerary,
            },
          });
        }

        // Second attempt: DRIVE alternative (should pass strict evidence bundle).
        const itinerary = {
          request_id: req.request_id ?? 'e2e-pt-hard',
          days: [
            {
              date: '2026-06-01',
              items: [
                {
                  id: 'seg_drive_1',
                  type: 'DRIVE',
                  start_window: '23:30',
                  end_window: '00:00',
                  location_ref: { place_id: 'seg_drive_1', name: 'Taxi/Drive' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                },
              ],
            },
          ],
          action_plan: [],
        };
        const k3Log: any[] = [
          {
            step: 'REPAIR',
            timestamp: now,
            inputs_summary: 'Auto-heal: disable PUBLIC_TRANSIT and re-route via DRIVE',
            outputs_summary: 'Rerouted via taxi/drive',
            evidence_refs: [],
            metadata: {
              rule_id: 'temp_wind_speed_drive_limit_v1',
              details: {
                evidence: { type: 'weather_physics', value_mps: 10, threshold_mps: 15, source: 'DETERMINISTIC_DRIVE_STUB' },
              },
            },
          },
        ];
        return baseOrchestrationResult({
          answerText: 'replanned via drive',
          stepsExecuted: [{ stepId: 'REPAIR', success: true, duration: 1 }],
          decisionLog: k3Log,
          result: {
            state: baseState({
              current_step: 'DONE',
              decision_log: k3Log,
              itinerary,
              narration: {
                user_friendly_summary: 'Replanned via drive',
                day_by_day_narrative: [],
                highlights: [],
                tips: [],
                warnings: [
                  {
                    kind: 'iron_shield_evidence',
                    rule_id: 'temp_wind_speed_drive_limit_v1',
                    severity: 'HARD',
                    message: 'Drive feasible under wind threshold',
                    evidence: { type: 'weather_physics', value_mps: 10, threshold_mps: 15, source: 'DETERMINISTIC_DRIVE_STUB' },
                  },
                ],
              } as any,
            } as any),
            gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8, evidence_refs: [] },
            itinerary,
            decisionState: {
              optimizationHints: {
                method: 'CGUS',
                recommendedAlternativeId: 'plan-drive',
                alternatives: [
                  {
                    id: 'plan-drive',
                    expectedUtility: 0.8,
                    feasibilityProbability: 0.98,
                    summary: 'Transit unavailable; rerouted via drive/taxi',
                    itinerary,
                    violations: [],
                  },
                ],
              },
            },
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (prevUseClaudeEnv === undefined) delete process.env.USE_CLAUDE_ORCHESTRATION;
    else process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    if (prevStrictEb === undefined) delete process.env.C1_STRICT_EVIDENCE_BUNDLE;
    else process.env.C1_STRICT_EVIDENCE_BUNDLE = prevStrictEb;
    await app.close();
    await moduleRef.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestDeduplication.checkDuplicate.mockReturnValue(null);
  });

  it('auto-heals a CANCELLED TRANSIT plan into DRIVE and returns strict-valid evidence_bundle', async () => {
    const body = {
      request_id: 'e2e-pt-hard',
      user_id: 'u1',
      trip_id: 'trip-e2e',
      message: 'late night transit plan',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
      },
    };

    const response = await request(app.getHttpServer()).post('/agent/route_and_run').send(body).expect(200);
    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);

    const payload = response.body.result.payload;
    expect(payload?.evidence_bundle).toBeTruthy();
    expect(payload?.evidence_bundle?.verification_status).not.toBe('FAILED');

    const itineraryItems =
      payload?.orchestrationResult?.itinerary?.days?.[0]?.items ??
      payload?.timeline?.[0]?.items ??
      [];
    expect(itineraryItems.some((it: any) => it?.type === 'DRIVE')).toBe(true);
    expect(itineraryItems.some((it: any) => it?.type === 'TRANSIT')).toBe(false);

    const alternatives = payload?.alternatives ?? payload?.candidates ?? [];
    expect(Array.isArray(alternatives)).toBe(true);
    expect(alternatives.length).toBeGreaterThanOrEqual(1);
    expect(alternatives[0]?.evidence_bundle).toBeTruthy();

    const stub = moduleRef.get(ClaudeOrchestratorService) as any;
    expect(stub.orchestrateWithStateMachine).toHaveBeenCalledTimes(2);
  });

  it('auto-heals a transfer-window-violated TRANSIT plan into DRIVE (C1 strict)', async () => {
    const body = {
      request_id: 'e2e-pt-hard-transfer',
      user_id: 'u1',
      trip_id: 'trip-e2e',
      message: 'late night transit plan transfer',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
      },
    };

    const response = await request(app.getHttpServer()).post('/agent/route_and_run').send(body).expect(200);
    const p1 = summarizeP1RouteAndRunValidation(response.body);
    expect(p1.valid).toBe(true);

    const payload = response.body.result.payload;
    expect(payload?.evidence_bundle).toBeTruthy();
    expect(payload?.evidence_bundle?.verification_status).not.toBe('FAILED');

    const items =
      payload?.orchestrationResult?.itinerary?.days?.[0]?.items ??
      payload?.timeline?.[0]?.items ??
      [];
    expect(items.some((it: any) => it?.type === 'DRIVE')).toBe(true);
    expect(items.some((it: any) => it?.type === 'TRANSIT')).toBe(false);
  });
});

