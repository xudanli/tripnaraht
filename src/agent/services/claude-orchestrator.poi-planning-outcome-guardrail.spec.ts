/**
 * Phase 2.1 — POI planning outcome 写入链轻量守护（非重型 e2e）
 *
 * 锁住：POI_SELECTION → metadata.poiPlanningOutcome.poiSelection（含 topAnchorRanks）；
 * itinerary → itineraryFinal；Route 响应 observability.poi_planning 与 metadata 对齐。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { RouteRunItineraryPoiHydratorService } from './route-run-itinerary-poi-hydrator.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import type { DecisionState, PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { Itinerary, OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';

describe('ClaudeOrchestratorService — poiPlanning outcome guardrail (Phase 2.1)', () => {
  const rid = 'orch-poi-outcome-guard-1';

  const goldenCircleSlice = (): PoiPlanningDecisionSlice => ({
    routeIntent: { regionId: 'golden_circle', confidence: 0.9 },
    poiPlan: {
      requiredAnchorPoiIds: ['thingvellir', 'geysir', 'gullfoss'],
      optionalCandidatePoiIds: ['secret_lagoon'],
      excludedPoiIds: [],
      selectedOptionalPoiIds: [],
    },
    schedulePlan: {
      totalBudgetMinutes: 600,
      requiredCostMinutes: 400,
      optionalCapacityMinutes: 120,
      bufferMinutes: 60,
      feasibility: 'ok',
    },
    resolution: { source: 'region_intent_resolver', matchedBy: 'region_id' },
    budgetGateApplied: false,
  });

  const minimalOrchestratorState = (over: Partial<OrchestratorState> = {}): OrchestratorState =>
    ({
      request_id: rid,
      current_step: 'POI_SELECTION',
      trip_plan_request: {} as any,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
      ...over,
    }) as OrchestratorState;

  const minimalDso = (poiPlanning?: PoiPlanningDecisionSlice): DecisionState =>
    ({
      requestId: rid,
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: rid,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
      ...(poiPlanning ? { poiPlanning } : {}),
    }) as DecisionState;

  async function createOrchestrator() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeOrchestratorService,
        {
          provide: LlmService,
          useValue: {
            getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.ANTHROPIC),
            callLlmWithSchema: jest.fn(),
          },
        },
        {
          provide: SKILLS_REGISTRY_TOKEN,
          useValue: {
            getAllSkills: jest.fn().mockReturnValue([]),
            getSkill: jest.fn().mockReturnValue(null),
          },
        },
        { provide: PrismaService, useValue: {} },
        {
          provide: RagRealityPolicyGateService,
          useValue: {
            resolve: jest.fn().mockReturnValue({ scope: 'full', policy: {} }),
            mergeChunkRetrievalParams: jest.fn((p: unknown) => p),
          },
        },
      ],
    }).compile();
    return module.get<ClaudeOrchestratorService>(ClaudeOrchestratorService);
  }

  async function createAssembler() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteAndRunResponseAssemblerService,
        JepaProjectorService,
        {
          provide: TradeoffEngineService,
          useValue: { buildNegotiation: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: RouteRunItineraryPoiHydratorService,
          useValue: {
            hydrateFromItinerary: jest.fn().mockResolvedValue({ poi_cards: [], poi_cards_by_day: [] }),
          },
        },
      ],
    }).compile();
    return module.get<RouteAndRunResponseAssemblerService>(RouteAndRunResponseAssemblerService);
  }

  function scoredPoisGoldenCircle() {
    return [
      { name: 'Þingvellir', poi_planning_anchor_slug: 'thingvellir', source: 'research' },
      { name: 'Geysir', poi_planning_anchor_slug: 'geysir', source: 'research' },
      { name: 'Gullfoss', poi_planning_anchor_slug: 'gullfoss', source: 'research' },
    ];
  }

  function itineraryWithGcNames(): Itinerary {
    return {
      request_id: rid,
      days: [
        {
          date: '2026-07-01',
          items: [
            {
              id: 'i1',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:30',
              location_ref: { name: 'Thingvellir National Park' },
              evidence_refs: [],
              verified: true,
            },
            {
              id: 'i2',
              type: 'POI',
              start_window: '12:00',
              end_window: '13:00',
              location_ref: { name: 'Great Geysir' },
              evidence_refs: [],
              verified: true,
            },
            {
              id: 'i3',
              type: 'POI',
              start_window: '14:00',
              end_window: '15:30',
              location_ref: { name: 'Gullfoss' },
              evidence_refs: [],
              verified: true,
            },
          ],
        },
      ],
    };
  }

  it('A+B: 有 poiPlanning 时写入 poiSelection，且含 topAnchorRanks', async () => {
    const orch = await createOrchestrator();
    const slice = goldenCircleSlice();
    const ds = minimalDso(slice);
    const state = minimalOrchestratorState();

    (orch as any).recordPoiPlanningOutcomeAfterSelection(state, ds, scoredPoisGoldenCircle());

    const bundle = state.metadata.poiPlanningOutcome as Record<string, unknown> | undefined;
    expect(bundle).toBeDefined();
    const poiSel = bundle!.poiSelection as Record<string, unknown> | undefined;
    expect(poiSel).toBeDefined();
    expect(poiSel!.phase).toBe('poi_selection');
    expect(poiSel!.topAnchorRanks).toBeDefined();
    const ranks = poiSel!.topAnchorRanks as Record<string, number | null>;
    expect(ranks['thingvellir']).toBe(1);
    expect(ranks['geysir']).toBe(2);
    expect(ranks['gullfoss']).toBe(3);
    const metrics = poiSel!.metrics as { anchorCoverage: { rate: number } };
    expect(metrics.anchorCoverage.rate).toBe(1);
  });

  it('C: itinerary 后写入 itineraryFinal，且保留 poiSelection', async () => {
    const orch = await createOrchestrator();
    const ds = minimalDso(goldenCircleSlice());
    const state = minimalOrchestratorState({ itinerary: itineraryWithGcNames() });

    (orch as any).recordPoiPlanningOutcomeAfterSelection(state, ds, scoredPoisGoldenCircle());
    (orch as any).recordPoiPlanningOutcomeAfterItinerary(state, ds);

    const bundle = state.metadata.poiPlanningOutcome as Record<string, unknown>;
    expect(bundle.poiSelection).toBeDefined();
    expect(bundle.itineraryFinal).toBeDefined();
    const fin = bundle.itineraryFinal as { phase: string; metrics: { anchorCoverage: { rate: number } } };
    expect(fin.phase).toBe('itinerary_final');
    expect(fin.metrics.anchorCoverage.rate).toBe(1);
  });

  it('does not ask destination-scope clarification for existing-trip route order optimization', async () => {
    const orch = await createOrchestrator();
    const state = minimalOrchestratorState({
      trip_plan_request: {
        request_id: rid,
        trip_id: 'trip-1',
        message: '帮我优化第5天的路线顺序，减少交通时间',
        origin: '冰岛',
        destination: '冰岛',
      } as any,
      research_data: {
        poi_evidence: [{ id: 1, name: 'Only existing nearby POI', category: 'ATTRACTION' }],
      },
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        tripId: 'trip-1',
        intake_user_message: '帮我优化第5天的路线顺序，减少交通时间',
      },
    });

    const result = await (orch as any).executePoiSelectionStep(state);

    expect(result.needsClarification).toBe(false);
    expect(state.clarification_questions ?? []).toEqual([]);
    expect(
      state.gaps?.some((g) => g.type === 'MISSING_DESTINATION' && /候选点不足|目的地范围/.test(g.detail)),
    ).not.toBe(true);
    expect(state.metadata.poi_selection_destination_scope_clarification_bypassed).toMatchObject({
      reason: 'EXISTING_TRIP_ROUTE_ORDER_OPTIMIZATION',
      min_poi_required: 2,
    });
    expect(state.metadata.poi_selection_destination_scope_clarification_bypassed.selected_count).toBeLessThan(2);
  });

  it('D: assembleClaudeStateMachineResponse 中 observability.poi_planning.outcome 与 metadata 对齐', async () => {
    const orch = await createOrchestrator();
    const assembler = await createAssembler();
    const ds = minimalDso(goldenCircleSlice());
    const state = minimalOrchestratorState({ itinerary: itineraryWithGcNames() });

    (orch as any).recordPoiPlanningOutcomeAfterSelection(state, ds, scoredPoisGoldenCircle());
    (orch as any).recordPoiPlanningOutcomeAfterItinerary(state, ds);

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      result: {
        state,
        itinerary: state.itinerary,
        decisionState: ds,
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        },
      },
      stepsExecuted: [{ stepId: 'POI_SELECTION', success: true, duration: 1 }],
      totalDuration: 2,
    };

    const req = {
      request_id: rid,
      message: 'test',
      options: { max_seconds: 60, max_steps: 8 },
    } as RouteAndRunRequestDto;

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request: req,
      startTime: Date.now(),
      orchestrationResult,
    });

    const obs = resp.observability as { poi_planning?: { outcome?: unknown } };
    expect(obs.poi_planning).toBeDefined();
    expect(obs.poi_planning!.outcome).toEqual(state.metadata.poiPlanningOutcome);
    expect(obs.poi_planning!.regionId).toBe('golden_circle');
  });
});
