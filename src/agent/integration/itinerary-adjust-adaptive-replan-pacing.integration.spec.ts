/**
 * E2E：绑定 Trip「明天太累了，轻松一点」→ ITINERARY_ADJUST + adaptive_replan → 工作台卡片。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from '../services/route-and-run-response-assembler.service';
import { JepaProjectorService } from '../services/jepa-projector.service';
import { TradeoffEngineService } from '../services/tradeoff-engine.service';
import { NegotiationSessionStoreService } from '../services/negotiation-session-store.service';
import { RouteRunItineraryPoiHydratorService } from '../services/route-run-itinerary-poi-hydrator.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { Itinerary, OrchestratorState } from '../interfaces/trip-plan.interface';
import { analyzeRouteAndRunIntent } from '../utils/route-and-run-intent-analyzer.util';
import {
  detectItineraryAdjustIntent,
  extractItineraryAdjustTargetDateFromMessage,
} from '../utils/itinerary-adjust-intent.util';
import {
  detectAdaptiveReplanTrigger,
  resolveAdaptiveReplanFatigueLevel,
  runAdaptiveReplanForAdjustState,
  shouldRequestAdaptiveReplan,
} from '../utils/itinerary-adjust-adaptive-replan.util';
import {
  extractPoiNamesFromItineraryDay,
  extractScheduleItemsFromItineraryDay,
} from '../utils/itinerary-adjust-decision-log.util';
import { buildItineraryAdjustDraftScheduleLines } from '../utils/itinerary-adjust-optimization-summary.util';
import { scopeOrchestratorNarrationToAdjustTarget } from '../utils/itinerary-adjust-decision-log.util';
import { ItineraryVerifySkill } from '../../skills/itinerary/itinerary-verify.skill';
import { RepairApplySkill } from '../../skills/itinerary/repair-apply.skill';
import { ItinerarySmartUpdateSkill } from '../../skills/itinerary/itinerary-smart-update.skill';
import { ItineraryAdaptiveReplanSkill } from '../../skills/itinerary/itinerary-adaptive-replan.skill';
import { ItineraryExperienceCuratorSkill } from '../../skills/itinerary/itinerary-experience-curator.skill';
import type { SkillsRegistryService } from '../../skills/services/skills-registry.service';

const USER_MSG = '明天太累了，轻松一点';
const TRIP_ID = 'trip-adaptive-replan-pacing-e2e';
const REQUEST_ID = 'req-adaptive-replan-pacing-e2e';
const DATE_RANGE = { start_date: '2026-06-01', end_date: '2026-06-07' };
/** 墙钟 6/5 说「明天」→ 6/6（第 6 天），与 status 是否 PLANNING 无关 */
const SIMULATED_NOW = new Date('2026-06-05T12:00:00.000Z');
const TARGET_DATE = '2026-06-06';
const TARGET_DAY_NUMBER = 6;

function poiItem(
  id: string,
  name: string,
  start: string,
  end: string,
  durationMinutes = 120,
): Itinerary['days'][0]['items'][0] {
  return {
    id,
    type: 'POI',
    start_window: `${TARGET_DATE}T${start}`,
    end_window: `${TARGET_DATE}T${end}`,
    location_ref: { place_id: id, name },
    evidence_refs: [],
    verified: false,
    metadata: { duration_minutes: durationMinutes },
  };
}

/** 模拟 PLAN_GEN 后目标日过密草案（4 个 POI，08:00 出发） */
function buildDenseTargetDayItinerary(): Itinerary {
  return {
    request_id: REQUEST_ID,
    days: [
      { date: '2026-06-01', items: [poiItem('d1-a', '冰河湖', '09:00', '11:00')] },
      { date: '2026-06-02', items: [poiItem('d2-a', '维克镇', '09:00', '11:00')] },
      { date: '2026-06-03', items: [poiItem('d3-a', '霍芬', '09:00', '11:00')] },
      { date: '2026-06-04', items: [poiItem('d4-a', '杰古沙龙', '09:00', '11:00')] },
      { date: '2026-06-05', items: [poiItem('d5-a', '钻石沙滩', '09:00', '11:00')] },
      {
        date: TARGET_DATE,
        items: [
          poiItem('d6-a', '斯科加瀑布', '08:00', '10:00', 150),
          poiItem('d6-b', '塞里雅兰瀑布', '10:30', '12:00', 120),
          poiItem('d6-c', '黑沙滩', '13:00', '15:00', 180),
          poiItem('d6-d', '迪霍拉利', '15:30', '17:00', 90),
        ],
      },
      { date: '2026-06-07', items: [poiItem('d7-a', '雷克雅未克', '09:00', '11:00')] },
    ],
  };
}

function buildSkillsRegistryForAdaptiveReplan(): SkillsRegistryService {
  const verify = new ItineraryVerifySkill();
  const repair = new RepairApplySkill();
  const smartUpdate = new ItinerarySmartUpdateSkill(verify, repair);
  const experienceCurator = new ItineraryExperienceCuratorSkill();
  let adaptiveReplan: ItineraryAdaptiveReplanSkill;
  const registry = {
    getSkill: (name: string) => {
      if (name === 'itinerary.adaptive_replan') return adaptiveReplan;
      if (name === 'itinerary.smart_update') return smartUpdate;
      if (name === 'itinerary.experience_curator' || name === 'itinerary.experience_align') {
        return experienceCurator;
      }
      return undefined;
    },
    getAllSkills: () => [],
  } as unknown as SkillsRegistryService;
  adaptiveReplan = new ItineraryAdaptiveReplanSkill(registry);
  return registry;
}

function buildPostIntakeMetadata(): Record<string, unknown> {
  const routeIntent = analyzeRouteAndRunIntent(USER_MSG, {
    tripId: TRIP_ID,
    hasTripDays: true,
  });
  return {
    intake_user_message: USER_MSG,
    route_and_run_intent: routeIntent,
    itinerary_adjust_intake: true,
    itinerary_adjust_target_date_iso: TARGET_DATE,
    itinerary_adjust_neighbor_anchors: {
      targetDayNumber: TARGET_DAY_NUMBER,
      targetDateIso: TARGET_DATE,
      startAnchorSource: 'prev_day_last',
      endAnchorSource: 'next_day_first',
    },
    adaptive_replan_requested: true,
    adaptive_replan_trigger: detectAdaptiveReplanTrigger(USER_MSG),
    odyssey_planning_branch: {
      tier: 3,
      tier_label: 'Sovereign',
      matchmaking_mode: 'OFF',
      planning_pace: 'relaxed',
      style_tags: ['managed', 'restorative', 'digital_detox'],
      preferred_route_node_ids: [],
      block_auto_companion_listing: true,
      post_booking_saga_enabled: false,
    },
  };
}

describe('itinerary adjust adaptive replan pacing e2e', () => {
  describe('intent + intake flags', () => {
    it('classifies bound trip message as ITINERARY_ADJUST with pacing trigger', () => {
      expect(detectItineraryAdjustIntent(USER_MSG)).toBe(true);
      const analysis = analyzeRouteAndRunIntent(USER_MSG, {
        tripId: TRIP_ID,
        hasTripDays: true,
      });
      expect(analysis.primary).toBe('ITINERARY_ADJUST');
      expect(detectAdaptiveReplanTrigger(USER_MSG)).toBe('pacing');
      expect(resolveAdaptiveReplanFatigueLevel(USER_MSG)).toBe(85);
      expect(
        extractItineraryAdjustTargetDateFromMessage(USER_MSG, {
          ...DATE_RANGE,
          now: SIMULATED_NOW,
        }),
      ).toBe(TARGET_DATE);
      expect(
        shouldRequestAdaptiveReplan({
          routePrimary: analysis.primary,
          itineraryAdjustIntake: true,
        }),
      ).toBe(true);
    });
  });

  describe('PLAN_GEN → adaptive_replan pipeline', () => {
    it('thins POIs, inserts rest, and records rationale for fatigue pacing', async () => {
      const state = {
        request_id: REQUEST_ID,
        current_step: 'PLAN_GEN',
        verdict: 'ALLOW',
        plan_version: 1,
        decision_log: [],
        evidence_registry: new Map(),
        errors: [],
        trip_plan_request: {
          request_id: REQUEST_ID,
          trip_id: TRIP_ID,
          destination: '冰岛',
          date_range: DATE_RANGE,
          days: 7,
          message: USER_MSG,
        },
        itinerary: buildDenseTargetDayItinerary(),
        metadata: buildPostIntakeMetadata(),
      } as unknown as OrchestratorState;

      const registry = buildSkillsRegistryForAdaptiveReplan();
      const applied = await runAdaptiveReplanForAdjustState(state, registry);
      expect(applied).toBe(true);

      const md = state.metadata as Record<string, unknown>;
      expect(md.adaptive_replan_result).toMatchObject({
        verified: expect.any(Boolean),
        persona_travel_style: 'deep_privacy',
        target_days: [TARGET_DAY_NUMBER],
        trigger: 'pacing',
      });
      expect(Array.isArray(md.adaptive_replan_rationale_zh)).toBe(true);
      expect((md.adaptive_replan_rationale_zh as string[]).length).toBeGreaterThan(0);

      const targetDay = state.itinerary?.days?.find(
        (d) => String(d.date).slice(0, 10) === TARGET_DATE,
      );
      expect(targetDay).toBeDefined();
      const pois = targetDay!.items.filter((it) => it.type === 'POI');
      expect(pois.length).toBeLessThanOrEqual(2);
      expect(targetDay!.items.some((it) => it.type === 'REST')).toBe(true);

      const decision = state.decision_log.find(
        (e) => e.metadata?.system_action === 'ITINERARY_ADAPTIVE_REPLAN_APPLIED',
      );
      expect(decision).toBeDefined();
      expect(String(decision?.outputs_summary)).toContain('PersonaRearrange');

      const adjustResult = md.itinerary_adjust_result as {
        draft_schedule_zh?: string[];
        optimization_summary_zh?: string;
        poi_names?: string[];
      };
      expect(adjustResult).toBeDefined();
      expect(adjustResult?.optimization_summary_zh).toMatch(/轻松|其它天不变|节奏/i);

      const scheduleAfterReplan = extractScheduleItemsFromItineraryDay(state.itinerary, TARGET_DATE);
      const draftLines = buildItineraryAdjustDraftScheduleLines(scheduleAfterReplan);
      if (draftLines.length > 0) {
        expect(adjustResult?.draft_schedule_zh).toEqual(draftLines);
      }
    });
  });

  describe('NARRATE → itinerary_adjust_result', () => {
    it('merges adaptive replan rationale into workbench optimization card', async () => {
      const state = {
        request_id: REQUEST_ID,
        current_step: 'NARRATE',
        verdict: 'ALLOW',
        plan_version: 1,
        decision_log: [],
        evidence_registry: new Map(),
        errors: [],
        trip_plan_request: {
          request_id: REQUEST_ID,
          trip_id: TRIP_ID,
          date_range: DATE_RANGE,
        },
        itinerary: buildDenseTargetDayItinerary(),
        narration: {
          day_by_day_narrative: [
            { day: 1, date: '2026-06-01', narrative: '第 1 天：冰河湖。' },
            { day: TARGET_DAY_NUMBER, date: TARGET_DATE, narrative: '第 6 天：南岸瀑布与黑沙滩。' },
          ],
          highlights: [],
          tips: [],
        },
        metadata: {
          ...buildPostIntakeMetadata(),
          itinerary_adjust_execution_mode: 'ADVICE_ONLY',
          adaptive_replan_rationale_zh: [
            '疲劳/节奏控制：移除次要高消耗 POI「黑沙滩」',
            '人格对齐：在 15:00–16:00 插入休息空档',
          ],
        },
      } as unknown as OrchestratorState;

      scopeOrchestratorNarrationToAdjustTarget(state);

      const result = (state.metadata as Record<string, unknown>)
        .itinerary_adjust_result as {
        target_date_iso?: string;
        user_intent_echo_zh?: string;
        rationale_bullets_zh?: string[];
        optimization_summary_zh?: string;
        draft_schedule_zh?: string[];
      };

      expect(result).toBeDefined();
      expect(result.target_date_iso).toBe(TARGET_DATE);
      expect(result.user_intent_echo_zh).toContain('更轻松');
      expect(result.rationale_bullets_zh?.[0]).toContain('轻松');
      expect(result.rationale_bullets_zh?.some((b) => b.includes('驾驶走廊'))).toBe(false);
      expect(result.optimization_summary_zh?.length).toBeGreaterThan(0);
      expect(state.narration?.day_by_day_narrative).toHaveLength(1);
      expect(state.narration?.day_by_day_narrative?.[0].date).toBe(TARGET_DATE);
    });
  });

  describe('RouteAndRunResponseAssembler — client payload', () => {
    async function createAssembler(itinerary: Itinerary) {
      const poiCards = itinerary.days.flatMap((day, idx) =>
        day.items
          .filter((it) => it.type === 'POI')
          .map((item) => ({
            place_id: null,
            uuid: null,
            itinerary_item_id: item.id,
            day_index: idx + 1,
            date: day.date,
            item_type: 'POI',
            start_window: item.start_window,
            end_window: item.end_window,
            itinerary_name: item.location_ref?.name ?? '',
            name_cn: item.location_ref?.name ?? null,
            name_en: null,
            display_name: item.location_ref?.name ?? '',
            category: 'ATTRACTION',
            rating: 4.5,
            description: null,
            address: null,
            lat: null,
            lng: null,
            tags: [],
            matched_from: 'place_id' as const,
            ontologyRules: null,
            resolved_from_place_registry: true,
          })),
      );

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
              loadPersistedTripItinerary: jest.fn().mockResolvedValue(null),
              hydrateFromItinerary: jest.fn().mockResolvedValue({
                poi_cards: poiCards,
                poi_cards_by_day: [],
              }),
            },
          },
        ],
      }).compile();
      return module.get(RouteAndRunResponseAssemblerService);
    }

    it('exposes pacing adjust card scoped to tomorrow with adaptive rationale', async () => {
      const itinerary = buildDenseTargetDayItinerary();
      const state = {
        request_id: REQUEST_ID,
        current_step: 'DONE',
        verdict: 'ALLOW',
        plan_version: 1,
        decision_log: [],
        evidence_registry: new Map(),
        errors: [],
        trip_plan_request: {
          request_id: REQUEST_ID,
          destination: '冰岛',
          date_range: DATE_RANGE,
          days: 7,
        },
        narration: {
          user_friendly_summary: `已根据疲劳反馈放缓第 ${TARGET_DAY_NUMBER} 天节奏。`,
          day_by_day_narrative: [
            {
              day: TARGET_DAY_NUMBER,
              date: TARGET_DATE,
              narrative: `第 ${TARGET_DAY_NUMBER} 天：精选瀑布，下午留休息空档。`,
            },
          ],
          highlights: [],
          tips: [],
        },
        metadata: {
          ...buildPostIntakeMetadata(),
          itinerary_adjust_execution_mode: 'ADVICE_ONLY',
          adaptive_replan_rationale_zh: [
            '疲劳/节奏控制：移除次要高消耗 POI「黑沙滩」',
            '人格对齐：在 15:00–16:00 插入休息空档',
          ],
          itinerary_adjust_result: {
            target_date_iso: TARGET_DATE,
            target_day_number: TARGET_DAY_NUMBER,
            execution_mode: 'ADVICE_ONLY',
            applied: false,
            status_label_zh: '草案待确认',
            poi_names: ['斯科加瀑布', '塞里雅兰瀑布'],
            draft_schedule_zh: ['09:30–11:00 斯科加瀑布', '15:00–16:00 休息空档'],
            route_context_zh: '沿前后天锚点走廊单日插值重排。',
            optimization_summary_zh: '自适应改排：已放缓节奏并插入休息空档。',
            rationale_bullets_zh: [
              '自适应改排（人格+环境约束）：',
              '人格对齐：在 15:00–16:00 插入休息空档',
              '当前为优化草案：确认无误后点击「应用到行程」写入正式行程。',
            ],
            apply_confirmation_zh: `确认后点击「应用到行程」，将把第 ${TARGET_DAY_NUMBER} 天（${TARGET_DATE}）更新为上方草案日程；其余日期不变。`,
            apply_confirmation_lines: [],
            apply_hint_zh: '确认无误后点击「应用到行程」。',
            display_title_zh: `第 ${TARGET_DAY_NUMBER} 天（${TARGET_DATE}）`,
            suppress_chat_lead: true,
          },
        },
      } as unknown as OrchestratorState;

      const assembler = await createAssembler(itinerary);
      const resp = await assembler.assembleClaudeStateMachineResponse({
        request: {
          request_id: REQUEST_ID,
          message: USER_MSG,
          trip_id: TRIP_ID,
        } as RouteAndRunRequestDto,
        startTime: Date.now(),
        orchestrationResult: {
          success: true,
          answerText: 'ignored',
          stepsExecuted: [],
          totalDuration: 5000,
          result: {
            state,
            itinerary,
            gate_result: {
              gate_result: 'ALLOW',
              violations: [],
              required_adjustments: [],
              confidence: 0.85,
              evidence_refs: [],
            },
          },
        } as OrchestrationResult,
        routingTaskType: 'TRIP_PLANNING',
      });

      const payload = resp.result?.payload as Record<string, unknown>;
      expect(payload?.itinerary_adjust_intake).toBe(true);
      expect(payload?.decision_cockpit_ui_suppressed).toBe(true);

      const timeline = payload?.timeline as Array<{ date: string; items: unknown[] }>;
      expect(timeline).toHaveLength(1);
      expect(timeline[0].date).toBe(TARGET_DATE);

      const adjust = payload?.itinerary_adjust_result as {
        target_date_iso?: string;
        rationale_bullets_zh?: string[];
        draft_schedule_zh?: string[];
      };
      expect(adjust?.target_date_iso).toBe(TARGET_DATE);
      expect(
        adjust?.rationale_bullets_zh?.some((b) => b.includes('轻松') || b.includes('→')),
      ).toBe(true);
      expect(adjust?.draft_schedule_zh?.length).toBeGreaterThan(0);
      expect(resp.result?.answer_text).not.toContain('安全守护者 Abu');
    });
  });
});
