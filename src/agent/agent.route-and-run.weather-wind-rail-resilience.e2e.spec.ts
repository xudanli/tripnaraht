/**
 * HTTP E2E (deterministic stub) for multi-factor orchestration:
 * - drive_safety_v1 is VIOLATED (wind lock)
 * - rail_safety_v1 remains SAFE (resilience mapping)
 *
 * Goal:
 * - First plan uses DRIVE with wind_speed_mps=25 for CAMPERVAN → strict EvidenceBundle FAILED.
 * - Sentinel retry should replan to RAIL (TRANSIT with metadata.transport_mode='RAIL') instead of REST.
 * - The healed plan must still satisfy PT-hard requirements for TRANSIT (public_transport_v1 evidence present and not cancelled).
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

describe('POST /agent/route_and_run — Wind Lock heals to RAIL (E2E)', () => {
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
      request_id: 'e2e-weather-rail',
      current_step: 'VERIFY',
      trip_plan_request: { request_id: 'e2e-weather-rail', origin: 'A', destination: 'B' },
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
        const isHeal =
          String(req?.meta?.weather_heal_retry ?? '') === '1' ||
          String(req?.emergency_constraints?.reason_code ?? '') === 'HEALING_DRIVE_SAFETY_FAILED';

        if (!isHeal) {
          const itinerary = {
            request_id: req.request_id ?? 'e2e-weather-rail',
            days: [
              {
                date: '2026-06-01',
                items: [
                  {
                    id: 'seg_drive_wind_1',
                    type: 'DRIVE',
                    start_window: '10:00',
                    end_window: '11:00',
                    location_ref: { place_id: 'seg_drive_wind_1', name: 'Drive segment' },
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
              inputs_summary: 'Weather verify: inject extreme wind for campervan',
              outputs_summary: 'DRIVE unsafe due to wind',
              evidence_refs: [],
              metadata: {
                rule_id: 'drive_safety_v1',
                details: {
                  evidence: {
                    type: 'weather_physics',
                    wind_speed_mps: 25,
                    vehicle_type: 'CAMPERVAN',
                    threshold_mps: 18,
                    source: 'DETERMINISTIC_WEATHER_STUB',
                    snapshotId: 'wx_snap_wind_rail_1',
                    is_violated: true,
                  },
                },
              },
            },
          ];

          return baseOrchestrationResult({
            answerText: 'wind unsafe',
            stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
            decisionLog: k3Log,
            result: {
              state: baseState({
                current_step: 'VERIFY',
                decision_log: k3Log,
                itinerary,
                narration: {
                  user_friendly_summary: 'wind unsafe',
                  day_by_day_narrative: [],
                  highlights: [],
                  tips: [],
                  warnings: [
                    {
                      kind: 'iron_shield_evidence',
                      rule_id: 'drive_safety_v1',
                      severity: 'HARD',
                      message: 'Extreme wind exceeds safe driving threshold for campervan',
                      evidence: { type: 'weather_physics', wind_speed_mps: 25, threshold_mps: 18, vehicle_type: 'CAMPERVAN', source: 'DETERMINISTIC_WEATHER_STUB' },
                    },
                  ],
                } as any,
              } as any),
              gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.7, evidence_refs: [] },
              itinerary,
            },
          });
        }

        // Heal attempt: choose rail transit (no DRIVE)
        const itinerary = {
          request_id: req.request_id ?? 'e2e-weather-rail',
          days: [
            {
              date: '2026-06-01',
              items: [
                {
                  id: 'seg_rail_1',
                  type: 'TRANSIT',
                  start_window: '10:10',
                  end_window: '11:10',
                  location_ref: { place_id: 'seg_rail_1', name: 'Rail segment' },
                  evidence_refs: [],
                  verified: false,
                  verification_status: 'ASSUMPTION',
                  metadata: { transport_mode: 'RAIL' },
                },
              ],
            },
          ],
          action_plan: [],
        };

        const k3Log: any[] = [
          // PT-hard evidence for transit availability (must be non-cancelled).
          {
            step: 'VERIFY',
            timestamp: now,
            inputs_summary: 'PT verify: rail service active',
            outputs_summary: 'RAIL active',
            evidence_refs: [],
            metadata: {
              rule_id: 'public_transport_v1',
              details: {
                evidence: {
                  type: 'public_transit',
                  segmentId: 'seg_rail_1',
                  departureTime: '2026-06-01T10:10:00.000Z',
                  serviceStatus: 'ACTIVE',
                  transferWindowMin: 6,
                  plannedTransferWindowMin: 8,
                  source: 'DETERMINISTIC_PT_STUB',
                  snapshotId: 'pt_snap_rail_active_1',
                  is_violated: false,
                },
              },
            },
          },
          // Weather snapshot still present (DRIVE violated but rail safe).
          {
            step: 'REPAIR',
            timestamp: now,
            inputs_summary: 'Sentinel auto-heal: avoid driving and switch to rail',
            outputs_summary: 'Converted DRIVE into RAIL',
            evidence_refs: [],
            metadata: {
              rule_id: 'drive_safety_v1',
              details: {
                evidence: {
                  type: 'weather_physics',
                  wind_speed_mps: 25,
                  vehicle_type: 'CAMPERVAN',
                  threshold_mps: 18,
                  source: 'DETERMINISTIC_WEATHER_STUB',
                  snapshotId: 'wx_snap_wind_rail_1',
                  is_violated: true,
                },
              },
            },
          },
        ];

        return baseOrchestrationResult({
          answerText: 'use rail',
          stepsExecuted: [{ stepId: 'REPAIR', success: true, duration: 1 }],
          decisionLog: k3Log,
          result: {
            state: baseState({
              current_step: 'REPAIR',
              decision_log: k3Log,
              itinerary,
              narration: {
                user_friendly_summary: 'use rail',
                day_by_day_narrative: [],
                highlights: [],
                tips: [],
                warnings: [
                  {
                    kind: 'iron_shield_evidence',
                    rule_id: 'drive_safety_v1',
                    severity: 'HARD',
                    message: 'Driving avoided due to extreme wind; rail remains operational',
                    evidence: { type: 'weather_physics', wind_speed_mps: 25, threshold_mps: 18, vehicle_type: 'CAMPERVAN', source: 'DETERMINISTIC_WEATHER_STUB' },
                  },
                ],
              } as any,
            } as any),
            gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.78, evidence_refs: [] },
            itinerary,
          },
        });
      }),
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
    process.env.USE_CLAUDE_ORCHESTRATION = prevUseClaudeEnv;
    process.env.C1_STRICT_EVIDENCE_BUNDLE = prevStrictEb;
    await app?.close();
  });

  it('heals DRIVE wind lock into RAIL transit (C1 strict)', async () => {
    const body = {
      request_id: 'e2e-weather-rail',
      user_id: 'u1',
      trip_id: 'trip-e2e',
      message: 'iceland relocation under wind lock',
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
    expect(items.some((it: any) => it?.type === 'DRIVE')).toBe(false);
    expect(items.some((it: any) => it?.type === 'TRANSIT')).toBe(true);
    expect(items.some((it: any) => String(it?.metadata?.transport_mode ?? '').toUpperCase() === 'RAIL')).toBe(true);

    const stub = moduleRef.get(ClaudeOrchestratorService) as any;
    expect(stub.orchestrateWithStateMachine).toHaveBeenCalledTimes(2);
  });
});

