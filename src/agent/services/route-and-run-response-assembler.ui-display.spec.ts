/**
 * Locks `result.payload.ui_display.evidence_cards_ui` parallel to `decision_metadata.evidence_cards`.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { NegotiationSessionStoreService } from './negotiation-session-store.service';
import { RouteRunItineraryPoiHydratorService } from './route-run-itinerary-poi-hydrator.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { DecisionLogEntry, OrchestratorState } from '../interfaces/trip-plan.interface';
import type { ClarificationQuestion } from '../interfaces/clarification.interface';

describe('RouteAndRunResponseAssemblerService — ui_display.evidence_cards_ui', () => {
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
          provide: NegotiationSessionStoreService,
          useValue: { set: jest.fn() },
        },
        {
          provide:         RouteRunItineraryPoiHydratorService,
          useValue: {
            hydrateFromItinerary: jest.fn().mockResolvedValue({ poi_cards: [], poi_cards_by_day: [] }),
            loadPersistedTripItinerary: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();
    return module.get(RouteAndRunResponseAssemblerService);
  }

  it('injects Tier-3 wind UI props with impact, social proof, and policy anchor (state machine path)', async () => {
    const assembler = await createAssembler();
    const state: OrchestratorState = {
      request_id: 'ui-display-1',
      current_step: 'DONE',
      verdict: 'ALLOW',
      plan_version: 0,
      decision_log: [
        {
          request_id: 'ui-display-1',
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
        precedent_n: 8,
        precedent_accept_pct: 91,
      },
      narration: {
        user_friendly_summary: 's',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        warnings: [
          {
            kind: 'iron_shield_evidence',
            message: 'Wind message',
            severity: 'HARD',
            rule_id: 'temp_wind_speed_drive_limit_v1',
            rule_name: 'High wind warning for driving segments',
            persuasion_tier: 3,
            narrator_hint_rendered: 'Tier 3 wind hint with physical anchor 25.0 m/s',
            evidence: {
              type: 'weather_physics',
              source: 'segment_prediction',
              value_mps: 25,
              threshold_mps: 15,
            },
          },
        ],
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        state,
        itinerary: { request_id: 'ui-display-1', days: [] },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const request = {
      request_id: 'ui-display-1',
      message: 'plan',
    } as RouteAndRunRequestDto;

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
    });

    const payload = resp.result.payload as Record<string, unknown>;
    const ui = payload.ui_display as { evidence_cards_ui?: unknown[] } | undefined;
    const logical = payload.decision_metadata as { evidence_cards?: unknown[] } | undefined;

    expect(logical?.evidence_cards).toHaveLength(1);
    expect(ui?.evidence_cards_ui).toHaveLength(1);

    const card = ui!.evidence_cards_ui![0] as Record<string, unknown>;
    expect(card.tier).toBe(3);
    expect(card.layout).toBe('authoritative');
    expect(card.theme).toBe('weather');
    expect(card.valueDisplay).toBe('25.0 m/s');
    expect(card.benchmark).toBe('Threshold: 15.0 m/s');
    expect(card.sourceLabel).toBe('segment_prediction');

    const impact = card.impact as { hours: number; label: string };
    expect(impact.hours).toBe(2.5);
    expect(impact.label).toBe('Estimated delay');

    expect(card.socialProof).toEqual({ count: 8, percentage: 91 });
    expect(card.policyReference).toMatchObject({
      ruleId: 'temp_wind_speed_drive_limit_v1',
      ruleName: 'High wind warning for driving segments',
    });
  });

  it('injects ui_display on System1 fast path when state has narration warnings', async () => {
    const assembler = await createAssembler();
    const state: OrchestratorState = {
      request_id: 's1-ui',
      current_step: 'DONE',
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
      narration: {
        user_friendly_summary: 's',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        warnings: [
          {
            kind: 'iron_shield_evidence',
            message: 'm',
            severity: 'SOFT',
            rule_id: 'temp_aurora_visibility_v2',
            persuasion_tier: 1,
            evidence: { type: 'solar_physics', source: 'sunset', baseline: '16:30', offset_min: 60, twilight_buffer_min: 30 },
          },
        ],
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'fast',
      stepsExecuted: [],
      totalDuration: 1,
      result: {
        routingDecision: {
          route: 'SYSTEM1_API',
          confidence: 0.9,
          reasoning: 'r',
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
        },
        state,
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request: { request_id: 's1-ui', message: 'q' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      system1Result: {
        success: true,
        answerText: 'ok',
        result: { timeline: [], dropped_items: [], candidates: [], evidence: [], robustness: null },
      },
    });

    const payload = resp.result.payload as Record<string, unknown>;
    const uiList = (payload.ui_display as { evidence_cards_ui?: unknown[] })?.evidence_cards_ui;
    expect(Array.isArray(uiList)).toBe(true);
    expect((uiList as unknown[]).length).toBe(1);
    const c = (uiList as Record<string, unknown>[])[0];
    expect(c.tier).toBe(1);
    expect(c.layout).toBe('minimalist');
    expect(c.theme).toBe('solar');
    expect(c.impact).toBeUndefined();
    expect(c.socialProof).toBeUndefined();
  });

  it('synthesizes non-empty clarificationQuestions for NEED_MORE_INFO when only clarificationMessage is set', async () => {
    const assembler = await createAssembler();
    const state: OrchestratorState = {
      request_id: 'clarify-nl',
      current_step: 'INTAKE',
      verdict: 'CLARIFY',
      plan_version: 0,
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: false,
      answerText: '为了更好地规划您的行程，请回答以下问题。',
      stepsExecuted: [],
      totalDuration: 1,
      totalCost: 0,
      result: {
        needsUserConfirmation: true,
        clarificationMessage: '请告诉我**目的地**和出行日期。',
        state,
      },
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request: { request_id: 'clarify-nl', message: 'plan' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
    });

    expect(resp.result.status).toBe('NEED_MORE_INFO');
    const qs = (resp.result.payload as { clarificationQuestions?: ClarificationQuestion[] }).clarificationQuestions;
    expect(Array.isArray(qs)).toBe(true);
    expect(qs!.length).toBeGreaterThan(0);
    expect(qs![0].id).toBe('nl_fallback_clarification');
    expect(qs![0].question).toContain('目的地');
    expect(qs![0].type).toBe('text');
    expect(resp.ui_state?.ui_status).toBe('awaiting_confirmation');
    expect(resp.ui_state?.requires_user_action).toBe(true);
    expect(resp.ui_state?.progress_percent).toBe(100);
  });

  it('explain.decision_log uses top-level orchestration decisionLog when state.decision_log is empty (RAG 轻量问答)', async () => {
    const assembler = await createAssembler();
    const doneEntry: DecisionLogEntry = {
      request_id: 'lw-rag-canonical',
      step: 'DONE',
      actor: 'Orchestrator',
      inputs_summary: '租车',
      outputs_summary: '知识库 RAG 4 条；单次 LLM，无 Skill DAG',
      evidence_refs: ['rag_chunk:chunk-1:file-1'],
      timestamp: new Date().toISOString(),
    };

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [
        { stepId: 'lightweight_llm_answer', skillName: 'direct_llm', success: true, duration: 1 },
      ],
      totalDuration: 1,
      decisionLog: [doneEntry],
      result: {
        lightweightKnowledgeQa: true,
        routingDecision: {
          route: 'SYSTEM2_REASONING',
          confidence: 0.88,
          reasoning: 'lightweight_knowledge_qa',
          budget: { max_seconds: 60, max_steps: 1, max_browser_steps: 0 },
          requiredCapabilities: ['qa'],
          consentRequired: false,
          selected_path: 'QA_LIGHT',
        },
        state: {
          request_id: 'lw-rag-canonical',
          current_step: 'DONE',
          decision_log: [],
          evidence_registry: new Map(),
          errors: [],
          metadata: {
            started_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          },
        } as OrchestratorState,
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request: { request_id: 'lw-rag-canonical', message: '冰岛租车' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'DATA_LOOKUP',
    });

    const explainDl = (resp.explain as { decision_log?: DecisionLogEntry[] })?.decision_log;
    expect(explainDl).toHaveLength(1);
    expect(explainDl![0].step).toBe('DONE');
    expect(explainDl![0].evidence_refs).toContain('rag_chunk:chunk-1:file-1');

    const payload = resp.result.payload as {
      unified_execution_trace?: { decision_log?: DecisionLogEntry[] };
    };
    expect(payload.unified_execution_trace?.decision_log).toHaveLength(1);

    // 轻量问答走 SYSTEM2_REASONING，observability 须为 SYSTEM2，避免前端用 system_mode 误藏「决策日志」
    expect((resp.observability as { system_mode?: string }).system_mode).toBe('SYSTEM2');
  });

  it('sanitizes gate_result violations for client (no L3-PROOF / ROUTE_INFEASIBLE in payload)', async () => {
    const assembler = await createAssembler();
    const rawDetail =
      '[VERIFY] ROUTE_INFEASIBLE [entity:OTHER:vehicle_terrain_arbitrator]: ' +
      '[L3-PROOF|terrain.f_road_compatibility|OTHER:vehicle_terrain_arbitrator|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:MODEL:user_query,intent_virtual_car_rental,itinerary_text] ' +
      '【车型-路况仲裁·意图合规】行程含 F-road/高地特征，用户话术表明使用 2WD/经济型车辆。';
    const state: OrchestratorState = {
      request_id: 'gate-sanitize-1',
      current_step: 'DONE',
      verdict: 'ALLOW',
      plan_version: 0,
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 1,
      result: {
        state,
        itinerary: { request_id: 'gate-sanitize-1', days: [] },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [
            {
              type: 'SAFETY',
              severity: 'HARD',
              detail: rawDetail,
              verify_synthetic: true,
            },
          ],
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request: { request_id: 'gate-sanitize-1', message: '冰岛自驾' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result.payload as {
      orchestrationResult?: { gate_result?: { violations?: Array<{ detail?: string; display_headline_zh?: string }> } };
      safety_surface?: { verify_issues?: Array<{ message?: string; headline_zh?: string; type?: string }> };
    };
    const gate = payload.orchestrationResult?.gate_result;
    expect(gate?.violations).toHaveLength(1);
    expect(gate?.violations?.[0]?.detail).not.toContain('[L3-PROOF');
    expect(gate?.violations?.[0]?.detail).not.toContain('ROUTE_INFEASIBLE');
    expect(gate?.violations?.[0]?.display_headline_zh).toContain('可执行性');
  });

  it('sanitizes VERIFY decision_log metadata.issues for advisory POI_CLOSED', async () => {
    const assembler = await createAssembler();
    const l3 =
      '[L3-PROOF|entity.opening_hours_overlap|POI:req-1_day1_item1|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:OPENING_HOURS] ' +
      'POI "Krossá River Crossing" 缺少开放时间数据';
    const verifyEntry: DecisionLogEntry = {
      request_id: 'advisory-1',
      step: 'VERIFY',
      actor: 'Orchestrator',
      inputs_summary: '验证',
      outputs_summary: '共发现 1 个问题',
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        issues: [{ code: 'POI_CLOSED', class: 'ADVISORY', message: l3 }],
      },
    };
    const state: OrchestratorState = {
      request_id: 'advisory-1',
      current_step: 'DONE',
      verdict: 'ALLOW',
      plan_version: 0,
      decision_log: [verifyEntry],
      evidence_registry: new Map(),
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 1,
      decisionLog: [verifyEntry],
      result: {
        state,
        itinerary: { request_id: 'advisory-1', days: [] },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeDynamicResponse({
      request: { request_id: 'advisory-1', message: '冰岛' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const explain = resp.explain as { decision_log?: Array<{ metadata?: { issues?: Array<Record<string, unknown>> } }> };
    const issue = explain.decision_log?.find((e) => e.metadata?.issues)?.metadata?.issues?.[0];
    expect(issue?.message).not.toContain('[L3-PROOF');
    expect(issue?.code_label_zh).toContain('开放时间');
    expect(issue?.class_label_zh).toBe('提示');
  });

  it('itinerary CRUD short-circuit uses planning success surface (not consultation red)', async () => {
    const assembler = await createAssembler();
    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '已将行程中「冰河湖」的行程时间调整为 11:00–12:40。',
      stepsExecuted: [{ stepId: 'REPAIR', skillName: 'trip.applyEdit', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        state: {
          request_id: 'crud-1',
          current_step: 'DONE',
          verdict: 'ALLOW',
          plan_version: 1,
          decision_log: [],
          evidence_registry: new Map(),
          errors: [],
          metadata: {
            started_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            itinerary_item_update_intake: true,
            itinerary_item_update_short_circuit: { applied: true, updatedCount: 1 },
          },
        } as OrchestratorState,
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
      request: { request_id: 'crud-1', message: '修改冰河湖时间', trip_id: 'trip-1' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.ui_surface).toBe('planning');
    expect(payload?.itinerary_item_crud).toBe(true);
    expect(payload?.consultation_itinerary_payload_suppressed).toBeUndefined();
    expect(resp.route.ui_hint.message).toBe('行程已更新');
    expect(resp.route.ui_hint.status).toBe('done');
    expect(resp.result?.status).toBe('OK');
    expect(payload?.iron_shield_ui_suppressed).toBe(true);
    expect(payload?.decision_cockpit_ui_suppressed).toBe(true);
    expect(resp.explain?.decision_cockpit).toBeUndefined();
    expect(payload?.evidence_bundle).toBeUndefined();
    expect(payload?.ui_display).toBeUndefined();
    expect(payload?.decision_metadata).toBeUndefined();
  });

  it('ITINERARY_ADJUST suppresses decision cockpit and uses day narrative answer', async () => {
    const assembler = await createAssembler();
    const hydrator = (assembler as unknown as { poiHydrator: RouteRunItineraryPoiHydratorService }).poiHydrator;
    (hydrator.hydrateFromItinerary as jest.Mock).mockResolvedValue({
      poi_cards: [{ poi_id: 'p1', display_name_zh: '辛格维利尔' }],
      poi_cards_by_day: [],
    });

    const itinerary = {
      request_id: 'adj-1',
      days: [
        {
          day_index: 1,
          date: '2026-06-02',
          items: [{ poi_id: 'p1', name: 'Thingvellir' }],
        },
      ],
    };

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText:
        '**基于当前行程会话的决策说明：**\n\n**推荐方案：** `plan-philosophy-aligned`',
      stepsExecuted: [{ stepId: 'NARRATE', skillName: 'narrate', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        state: {
          request_id: 'adj-1',
          current_step: 'DONE',
          verdict: 'ALLOW',
          plan_version: 2,
          decision_log: [],
          evidence_registry: new Map(),
          errors: [],
          narration: {
            user_friendly_summary:
              '安全守护者 Abu 检查了行程的所有路段，确认计划安全可行。\n\n节奏调节者 Dr.Dre 检查了行程节奏，认为当前安排合理。\n\n路线守护者 Neptune 检查了路线完整性，所有路段均可用。\n\n为您规划了2天的行程，行程已通过安全检查，包含黄金圈等亮点。',
            day_by_day_text_zh:
              '第 2 天（2026-06-02）\n上午从雷克雅未克出发，游览辛格维利尔国家公园、盖歇尔间歇泉与黄金瀑布，下午返回雷克雅未克；晚餐可选 Bæjarins Beztu 或 Messinn。',
          },
          metadata: {
            started_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            itinerary_adjust_intake: true,
            route_and_run_intent: {
              primary: 'ITINERARY_ADJUST',
              sub_signals: {},
              slot_placement_requested: false,
              intake_nl: '',
            },
          },
        } as OrchestratorState,
        itinerary,
        decisionState: {
          optimizationHints: {
            method: 'CGUS',
            recommendedAlternativeId: 'plan-philosophy-aligned',
            decisionVerdictNarrationZh: '**推荐方案：** `plan-philosophy-aligned`',
          },
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request: {
        request_id: 'adj-1',
        message: '请将我的6月2日行程更新为黄金圈',
        trip_id: 'trip-iceland-1',
      } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.itinerary_adjust_intake).toBe(true);
    expect(payload?.decision_cockpit_ui_suppressed).toBe(true);
    expect(payload?.iron_shield_ui_suppressed).toBe(true);
    expect(resp.explain?.decision_cockpit).toBeUndefined();
    expect(resp.explain?.optimization).toBeUndefined();
    expect(resp.explain?.unified).toBeUndefined();
    expect(resp.explain?.guardian_personas).toBeUndefined();
    expect(payload?.candidates).toEqual([]);
    expect(payload?.alternatives).toEqual([]);
    expect(payload?.safety_surface).toBeUndefined();
    expect(payload?.evidence_bundle).toBeUndefined();
    expect((resp.observability as { poi_planning?: { feasibility?: string } })?.poi_planning?.feasibility).toBe(
      'ok',
    );
    expect(resp.route.ui_hint.message).toBe('行程草案已更新');
    expect(resp.result?.answer_text).toContain('辛格维利尔');
    expect(resp.result?.answer_text).not.toContain('决策说明');
    expect(resp.result?.answer_text).not.toContain('plan-philosophy-aligned');
    expect(resp.result?.answer_text).not.toContain('安全守护者 Abu');
    expect(resp.result?.answer_text).not.toContain('Dr.Dre');
    expect(resp.result?.answer_text).not.toContain('Neptune');
  });

  it('ITINERARY_ADJUST detected from trip-bound message when metadata flags missing', async () => {
    const assembler = await createAssembler();
    const goldenCircleMsg =
      '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。晚餐推荐为Bæjarins Beztu热狗摊或Messinn餐厅。请生成新的行程草案。';
    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: '安全守护者 Abu 检查了行程的所有路段，确认计划安全可行。',
      stepsExecuted: [],
      totalDuration: 1,
      result: {
        state: {
          request_id: 'adj-fallback',
          current_step: 'DONE',
          verdict: 'ALLOW',
          plan_version: 1,
          decision_log: [],
          evidence_registry: new Map(),
          errors: [],
          narration: {
            day_by_day_text_zh: '2026-06-02\n黄金圈一日游草案。',
          },
          metadata: {
            started_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          },
        } as OrchestratorState,
        itinerary: { request_id: 'adj-fallback', days: [{ day_index: 2, date: '2026-06-02', items: [] }] },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 0.9,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request: {
        request_id: 'adj-fallback',
        message: goldenCircleMsg,
        trip_id: 'trip-iceland-1',
      } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.itinerary_adjust_intake).toBe(true);
    expect(payload?.decision_cockpit_ui_suppressed).toBe(true);
    expect(resp.result?.answer_text).toContain('黄金圈');
    expect(resp.result?.answer_text).not.toContain('安全守护者 Abu');
  });

  it('ITINERARY_ADJUST strips harness verify_synthetic gate violations and scopes timeline to target day', async () => {
    const assembler = await createAssembler();
    const goldenCircleMsg =
      '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。请生成新的行程草案。';
    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ignored',
      stepsExecuted: [],
      totalDuration: 1,
      result: {
        state: {
          request_id: 'adj-gate',
          current_step: 'DONE',
          verdict: 'ALLOW',
          plan_version: 1,
          decision_log: [],
          evidence_registry: new Map(),
          errors: [],
          trip_plan_request: {
            request_id: 'adj-gate',
            destination: '冰岛',
            date_range: { start_date: '2026-06-01', end_date: '2026-06-02' },
            days: 2,
          },
          narration: {
            day_by_day_narrative: [
              { day: 1, date: '2026-06-01', narrative: '第 1 天：米湖、众神瀑布等。' },
              { day: 2, date: '2026-06-02', narrative: '第 2 天：黄金圈一日游。' },
            ],
          },
          metadata: {
            started_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            itinerary_adjust_intake: true,
            intake_user_message: goldenCircleMsg,
          },
        } as OrchestratorState,
        itinerary: {
          request_id: 'adj-gate',
          days: [
            { day_index: 1, date: '2026-06-01', items: [{ poi_id: 'north', name: '米湖' }] },
            { day_index: 2, date: '2026-06-02', items: [{ poi_id: 'gc', name: '黄金瀑布' }] },
          ],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [
            {
              type: 'SAFETY',
              severity: 'HARD',
              detail:
                'UNKNOWN。VERIFY requires boundResearchSnapshotId on visible state (RESEARCH freeze).',
              verify_synthetic: true,
            },
          ],
          required_adjustments: [],
          confidence: 0.8,
          evidence_refs: [],
        },
      },
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request: {
        request_id: 'adj-gate',
        message: goldenCircleMsg,
        trip_id: 'trip-iceland-1',
      } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    const orchGate = (payload?.orchestrationResult as { gate_result?: { violations?: unknown[] } })
      ?.gate_result;
    expect(orchGate?.violations).toEqual([]);
    expect(payload?.timeline).toEqual([
      expect.objectContaining({ date: '2026-06-02' }),
    ]);
    expect(resp.result?.answer_text).toContain('黄金圈');
    expect(resp.result?.answer_text).not.toContain('米湖');
  });

  it('assembleClaudeStateMachineResponse surfaces accommodations from orchestration enrich', async () => {
    const assembler = await createAssembler();

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'NARRATE', skillName: 'narrate', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        state: {
          request_id: 'hotel-sm-1',
          current_step: 'DONE',
          verdict: 'ALLOW',
          plan_version: 1,
          decision_log: [],
          evidence_registry: new Map(),
          errors: [],
          metadata: {
            started_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            itinerary_full_trip_replan: true,
            full_trip_replan_hotel_requested: true,
          },
        } as OrchestratorState,
        itinerary: {
          request_id: 'hotel-sm-1',
          days: [{ date: '2026-11-01', items: [] }],
        },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
        accommodations: [{ id: 'h1', name: 'Hotel A', nightIndex: 1 }],
        accommodation_night_groups: [{ night_index: 1, cards: [{ id: 'h1', name: 'Hotel A' }] }],
        hotel_search_meta: { strategy: 'per_night_full_trip_replan', sampled_nights: [1, 2] },
        routing: { target: 'hotel' },
      } as OrchestrationResult['result'],
    };

    const resp = await assembler.assembleClaudeStateMachineResponse({
      request: {
        request_id: 'hotel-sm-1',
        message: '还缺住宿',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      routingTaskType: 'TRIP_PLANNING',
    });

    const payload = resp.result?.payload as Record<string, unknown>;
    expect(payload?.accommodations).toHaveLength(1);
    expect(payload?.accommodation_night_groups).toHaveLength(1);
    expect(payload?.hotel_search_meta).toEqual(
      expect.objectContaining({ strategy: 'per_night_full_trip_replan' }),
    );
  });

});
