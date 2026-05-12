/**
 * Consultation UI surface: strip itinerary-shaped payload so clients / Network tab
 * do not carry hidden schedule rows alongside ui_surface=consultation.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { NegotiationSessionStoreService } from './negotiation-session-store.service';
import { RouteRunItineraryPoiHydratorService } from './route-run-itinerary-poi-hydrator.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('RouteAndRunResponseAssemblerService — consultation surface strips itinerary payload', () => {
  let hydrateCalls: number;

  async function createAssembler() {
    hydrateCalls = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteAndRunResponseAssemblerService,
        JepaProjectorService,
        {
          provide: TradeoffEngineService,
          useValue: { buildNegotiation: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: NegotiationSessionStoreService,
          useValue: { set: jest.fn() },
        },
        {
          provide: RouteRunItineraryPoiHydratorService,
          useValue: {
            hydrateFromItinerary: jest.fn().mockImplementation(async () => {
              hydrateCalls += 1;
              return {
                poi_cards: [{ itinerary_item_id: 'x' }],
                poi_cards_by_day: [{ day_index: 1, cards: [] }],
              };
            }),
            hydratePersistedTripDraft: jest.fn().mockResolvedValue({ poi_cards: [], poi_cards_by_day: [] }),
          },
        },
      ],
    }).compile();
    return module.get(RouteAndRunResponseAssemblerService);
  }

  const minimalState = (id: string): OrchestratorState =>
    ({
      request_id: id,
      current_step: 'DONE',
      verdict: 'ALLOW',
      plan_version: 1,
      decision_log: [
        {
          request_id: id,
          step: 'VERIFY',
          actor: 'CoreDecision',
          inputs_summary: '',
          outputs_summary: '',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
        },
      ],
      evidence_registry: new Map(),
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        wall_hit_distance_ms: 9_000_000,
        precedent_n: 1,
        precedent_accept_pct: 90,
      },
    }) as OrchestratorState;

  it('state machine: lightweightKnowledgeQa clears timeline/days, skips POI hydration, sets flags', async () => {
    const assembler = await createAssembler();
    const request = { request_id: 'c1', message: '问一句' } as RouteAndRunRequestDto;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '答复正文',
      stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        lightweightKnowledgeQa: true,
        routingTaskType: 'TRIP_PLANNING',
        state: minimalState('c1'),
        itinerary: {
          request_id: 'c1',
          days: [{ date: '2026-06-01', items: [{ id: 'it1', type: 'POI' }] }],
        },
        consultation_dashboard: {
          version: 1 as const,
          headline: '草案整体可行',
          summary_cards: [{ id: 'x', title: '预算', value: '约 2–3 万', tone: 'neutral' as const }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.ui_surface).toBe('consultation');
    expect(payload?.consultation_itinerary_payload_suppressed).toBe(true);
    const dash = payload?.consultation_dashboard as { version?: number; headline?: string };
    expect(dash?.version).toBe(1);
    expect(dash?.headline).toBe('草案整体可行');
    expect(Array.isArray(payload?.timeline) && (payload.timeline as unknown[]).length).toBe(0);
    const orch = payload?.orchestrationResult as { itinerary?: { days?: unknown[] } };
    expect(orch?.itinerary?.days?.length ?? 0).toBe(0);
    expect(hydrateCalls).toBe(0);
  });

  it('state machine: lightweightKnowledgeQa + suggested_operations yields fallback consultation_dashboard', async () => {
    const assembler = await createAssembler();
    const request = { request_id: 'c1b', message: '问一句' } as RouteAndRunRequestDto;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '答复正文',
      stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        lightweightKnowledgeQa: true,
        routingTaskType: 'TRIP_PLANNING',
        state: minimalState('c1b'),
        suggested_operations: [
          {
            id: 'x',
            label: '查看行程时间轴',
            kind: 'client_navigation',
            payload: { trip_id: 't', route: 'timeline' },
          },
        ],
        itinerary: {
          request_id: 'c1b',
          days: [{ date: '2026-06-01', items: [{ id: 'it1', type: 'POI' }] }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    const dash = payload?.consultation_dashboard as { dashboard_origin?: string; headline?: string };
    expect(dash?.dashboard_origin).toBe('fallback');
    expect(dash?.headline).toBe('下一步操作');
    const orch = payload?.orchestrationResult as { itinerary?: { days?: unknown[] } };
    expect(orch?.itinerary?.days?.length ?? 0).toBe(0);
    expect(hydrateCalls).toBe(0);
  });

  it('assembleClaudeDynamicResponse: consultation clears timeline and itinerary.days', async () => {
    const assembler = await createAssembler();
    const request = { request_id: 'c2', message: '问一句' } as RouteAndRunRequestDto;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '答复',
      stepsExecuted: [],
      totalDuration: 1,
      totalCost: 0,
      result: {
        routingDecision: {
          route: 'SYSTEM2_REASONING',
          confidence: 0.9,
          reasons: [],
          requiredCapabilities: [],
          consentRequired: false,
          budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
        },
        lightweightKnowledgeQa: true,
        state: minimalState('c2'),
        itinerary: {
          request_id: 'c2',
          days: [{ date: '2026-06-02', items: [{ id: 'p', type: 'POI' }] }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'DATA_LOOKUP',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.ui_surface).toBe('consultation');
    expect(payload?.consultation_itinerary_payload_suppressed).toBe(true);
    expect((payload?.timeline as unknown[]).length).toBe(0);
    const orch = payload?.orchestrationResult as { itinerary?: { days?: unknown[] } };
    expect(orch?.itinerary?.days?.length ?? 0).toBe(0);
  });

  it('assembleClaudeDynamicResponse: DATA_LOOKUP lightweight + ops but no trip_id skips fallback consultation_dashboard', async () => {
    const assembler = await createAssembler();
    const request = { request_id: 'c2-nodash', message: '问一句' } as RouteAndRunRequestDto;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '答复',
      stepsExecuted: [],
      totalDuration: 1,
      totalCost: 0,
      result: {
        routingDecision: {
          route: 'SYSTEM2_REASONING',
          confidence: 0.9,
          reasons: [],
          requiredCapabilities: [],
          consentRequired: false,
          budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
        },
        lightweightKnowledgeQa: true,
        routingTaskType: 'DATA_LOOKUP',
        suggested_operations: [
          {
            id: 'nav',
            label: '打开时间轴',
            kind: 'client_navigation',
            payload: { route: 'timeline' },
          },
        ],
        state: minimalState('c2-nodash'),
        itinerary: {
          request_id: 'c2-nodash',
          days: [{ date: '2026-06-02', items: [{ id: 'p', type: 'POI' }] }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'DATA_LOOKUP',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.consultation_dashboard).toBeUndefined();
    expect(payload?.suggested_operations).toBeDefined();
  });

  it('assembleClaudeDynamicResponse: fallback dashboard merges RAG + hotel meta with suggested_operations', async () => {
    const assembler = await createAssembler();
    const request = { request_id: 'c3', message: '咨询' } as RouteAndRunRequestDto;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '答复',
      stepsExecuted: [],
      totalDuration: 1,
      totalCost: 0,
      result: {
        routingDecision: {
          route: 'SYSTEM2_REASONING',
          confidence: 0.9,
          reasons: [],
          requiredCapabilities: [],
          consentRequired: false,
          budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
        },
        state: minimalState('c3'),
        suggested_operations: [
          {
            id: 'nav',
            label: '打开时间轴',
            kind: 'client_navigation',
            payload: { trip_id: 't', route: 'timeline' },
          },
        ],
        data_lookup_rag_citations: [{ chunk_id: '1', file_id: 'f', document_title: 'Doc', category: 'practical' }],
        live_sensor_audit: [
          { tool_id: 'live_tool.mcp.weather', ok: true, latency_ms: 50 },
          { tool_id: 'live_tool.mcp.hotel', ok: true, latency_ms: 400 },
        ],
        hotel_search_meta: { disclaimer_zh: '每晚采样', strategy: 'per_night_sample' },
        itinerary: {
          request_id: 'c3',
          days: [{ date: '2026-06-03', items: [{ id: 'p', type: 'POI' }] }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'DATA_LOOKUP',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    const dash = payload?.consultation_dashboard as {
      dashboard_origin?: string;
      summary_cards?: Array<{ title?: string }>;
    };
    expect(dash?.dashboard_origin).toBe('fallback');
    expect(dash?.summary_cards?.some((c) => c.title === '界面入口')).toBe(true);
    expect(dash?.summary_cards?.some((c) => c.title === '实时查询')).toBe(true);
    expect(dash?.summary_cards?.some((c) => c.title === '知识依据')).toBe(true);
    expect(dash?.summary_cards?.some((c) => c.title === '住宿检索')).toBe(true);
  });

  it('assembleClaudeDynamicResponse: consultation + trip_id attaches persisted draft poi_cards_by_day after hygiene', async () => {
    let persistedCalls = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteAndRunResponseAssemblerService,
        JepaProjectorService,
        {
          provide: TradeoffEngineService,
          useValue: { buildNegotiation: jest.fn().mockResolvedValue(null) },
        },
        { provide: NegotiationSessionStoreService, useValue: { set: jest.fn() } },
        {
          provide: RouteRunItineraryPoiHydratorService,
          useValue: {
            hydrateFromItinerary: jest.fn().mockResolvedValue({ poi_cards: [], poi_cards_by_day: [] }),
            hydratePersistedTripDraft: jest.fn().mockImplementation(async () => {
              persistedCalls += 1;
              return {
                poi_cards: [{ itinerary_item_id: 'db1' }],
                poi_cards_by_day: [{ day_index: 1, date: '2026-06-01', cards: [{ itinerary_item_id: 'db1' }] }],
              };
            }),
          },
        },
      ],
    }).compile();
    const assembler = module.get(RouteAndRunResponseAssemblerService);
    const request = {
      request_id: 'c-poi',
      message: '问',
      trip_id: '11111111-1111-1111-1111-111111111111',
    } as RouteAndRunRequestDto;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '答复',
      stepsExecuted: [],
      totalDuration: 1,
      totalCost: 0,
      result: {
        routingDecision: {
          route: 'SYSTEM2_REASONING',
          confidence: 0.9,
          reasons: [],
          requiredCapabilities: [],
          consentRequired: false,
          budget: { max_seconds: 60, max_steps: 8, max_browser_steps: 0 },
        },
        lightweightKnowledgeQa: true,
        state: minimalState('c-poi'),
        itinerary: {
          request_id: 'c-poi',
          days: [{ date: '2026-06-02', items: [{ id: 'p', type: 'POI' }] }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'DATA_LOOKUP',
    });

    expect(persistedCalls).toBe(1);
    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.trip_persisted_poi_cards).toBe(true);
    const byDay = payload?.poi_cards_by_day as Array<{ cards?: unknown[] }>;
    expect(Array.isArray(byDay) && byDay.some((d) => (d.cards?.length ?? 0) > 0)).toBe(true);
  });
});
