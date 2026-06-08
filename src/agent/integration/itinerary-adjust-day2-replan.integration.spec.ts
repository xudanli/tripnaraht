/**
 * Regression: bound-trip「重新规划第二天」须走 ITINERARY_ADJUST，目标日 2026-06-02，外显时间轴仅该日。
 * Reproduces req-1780298303373-f3hlhg9gm / trip b950dbf2-7583-4b43-b0c6-ddd947719c54.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from '../services/route-and-run-response-assembler.service';
import { JepaProjectorService } from '../services/jepa-projector.service';
import { TradeoffEngineService } from '../services/tradeoff-engine.service';
import { NegotiationSessionStoreService } from '../services/negotiation-session-store.service';
import { RouteRunItineraryPoiHydratorService } from '../services/route-run-itinerary-poi-hydrator.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { analyzeRouteAndRunIntent } from '../utils/route-and-run-intent-analyzer.util';
import {
  detectItineraryAdjustIntent,
  extractItineraryAdjustTargetDateFromMessage,
} from '../utils/itinerary-adjust-intent.util';

const USER_MSG = '重新规划一下第二天的行程，现在明显不合理';
const TRIP_ID = 'b950dbf2-7583-4b43-b0c6-ddd947719c54';
const REQUEST_ID = 'req-1780298303373-f3hlhg9gm';
const DATE_RANGE = { start_date: '2026-06-01', end_date: '2026-06-07' };
const TARGET_DATE = '2026-06-02';

function buildSevenDayItineraryDays() {
  const dayPlans: Array<{ date: string; items: Array<{ id: string; name: string; place_id: string }> }> =
    [
      {
        date: '2026-06-01',
        items: [
          { id: `${REQUEST_ID}_day1_item1`, name: '冰河湖', place_id: '381041' },
          { id: `${REQUEST_ID}_day1_item2`, name: '维克超市', place_id: '381073' },
        ],
      },
      {
        date: TARGET_DATE,
        items: [
          { id: `${REQUEST_ID}_day2_item1`, name: '盖歇尔间歇泉', place_id: '381083' },
          { id: `${REQUEST_ID}_day2_item2`, name: '黄金瀑布', place_id: '381084' },
        ],
      },
      { date: '2026-06-03', items: [{ id: `${REQUEST_ID}_day3_item1`, name: '格伦达菲厄泽镇', place_id: '381085' }] },
      { date: '2026-06-04', items: [{ id: `${REQUEST_ID}_day4_item1`, name: '斯奈菲尔冰川国家公园', place_id: '381087' }] },
      { date: '2026-06-05', items: [{ id: `${REQUEST_ID}_day5_item1`, name: '冰河湖', place_id: '381041' }] },
      { date: '2026-06-06', items: [{ id: `${REQUEST_ID}_day6_item1`, name: '盖歇尔间歇泉', place_id: '381083' }] },
      { date: '2026-06-07', items: [{ id: `${REQUEST_ID}_day7_item1`, name: '格伦达菲厄泽镇', place_id: '381085' }] },
    ];
  return dayPlans.map((d, idx) => ({
    day_index: idx + 1,
    date: d.date,
    items: d.items.map((it) => ({
      id: it.id,
      type: 'POI',
      start_window: '09:00',
      end_window: '11:00',
      location_ref: { place_id: it.place_id, name: it.name },
    })),
  }));
}

describe('itinerary adjust day-2 replan integration (req-1780298303373)', () => {
  describe('intent and target date (pre-assembler)', () => {
    it('detects itinerary adjust from 重新规划 + 第二天 + 行程', () => {
      expect(detectItineraryAdjustIntent(USER_MSG)).toBe(true);
    });

    it('classifies bound trip as ITINERARY_ADJUST when trip has days', () => {
      const analysis = analyzeRouteAndRunIntent(USER_MSG, {
        tripId: TRIP_ID,
        hasTripDays: true,
      });
      expect(analysis.primary).toBe('ITINERARY_ADJUST');
      expect(analysis.intake_nl).toContain('重新规划');
    });

    it('resolves target calendar date as trip start + 1 for 第二天', () => {
      expect(extractItineraryAdjustTargetDateFromMessage(USER_MSG, DATE_RANGE)).toBe(TARGET_DATE);
    });
  });

  describe('RouteAndRunResponseAssembler — client payload scope', () => {
    function buildPoiCardsForSevenDays() {
      return buildSevenDayItineraryDays().flatMap((day) =>
        (day.items ?? []).map((item) => ({
          place_id: Number(item.location_ref?.place_id ?? 0) || null,
          uuid: null,
          itinerary_item_id: item.id,
          day_index: day.day_index,
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
    }

    async function createAssembler(poiCards = buildPoiCardsForSevenDays()) {
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
              hydrateFromItinerary: jest.fn().mockImplementation(async (itinerary: { days?: unknown[] }) => {
                const ids = new Set(
                  (itinerary?.days ?? []).flatMap((d: { items?: Array<{ id: string }> }) =>
                    (d.items ?? []).map((i) => i.id),
                  ),
                );
                const cards = poiCards.filter((c) => ids.has(c.itinerary_item_id));
                return { poi_cards: cards.length > 0 ? cards : poiCards, poi_cards_by_day: [] };
              }),
            },
          },
        ],
      }).compile();
      return module.get(RouteAndRunResponseAssemblerService);
    }

    it('scopes timeline and suppresses CGUS cockpit for day-2 replan message', async () => {
      const assembler = await createAssembler();
      const routeIntent = analyzeRouteAndRunIntent(USER_MSG, {
        tripId: TRIP_ID,
        hasTripDays: true,
      });

      const orchestrationResult: OrchestrationResult = {
        success: true,
        answerText:
          '**推荐方案：** `plan-philosophy-aligned`\n安全守护者 Abu 检查了行程的所有路段。',
        stepsExecuted: [],
        totalDuration: 22_000,
        result: {
          state: {
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
              user_friendly_summary: '安全守护者 Abu 检查了行程的所有路段，确认计划安全可行。',
              day_by_day_narrative: [
                { day: 1, date: '2026-06-01', narrative: '第 1 天：将游览冰河湖、维克超市。' },
                { day: 2, date: TARGET_DATE, narrative: '第 2 天：将游览盖歇尔间歇泉、黄金瀑布。' },
                { day: 3, date: '2026-06-03', narrative: '第 3 天：将游览格伦达菲厄泽镇。' },
              ],
              highlights: [],
              tips: [],
            },
            metadata: {
              started_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
              intake_user_message: USER_MSG,
              route_and_run_intent: routeIntent,
              itinerary_adjust_intake: true,
            },
          } as OrchestratorState,
          itinerary: {
            request_id: REQUEST_ID,
            days: buildSevenDayItineraryDays(),
          },
          gate_result: {
            gate_result: 'ALLOW',
            violations: [],
            required_adjustments: [],
            confidence: 0.8,
            evidence_refs: [],
          },
        },
      };

      const resp = await assembler.assembleClaudeStateMachineResponse({
        request: {
          request_id: REQUEST_ID,
          message: USER_MSG,
          trip_id: TRIP_ID,
        } as RouteAndRunRequestDto,
        startTime: Date.now(),
        orchestrationResult,
        routingTaskType: 'TRIP_PLANNING',
      });

      const payload = resp.result?.payload as Record<string, unknown>;
      expect(payload?.itinerary_adjust_intake).toBe(true);
      expect(payload?.decision_cockpit_ui_suppressed).toBe(true);
      expect(payload?.candidates).toEqual([]);
      expect(payload?.alternatives).toEqual([]);

      const timeline = payload?.timeline as Array<{ date: string; items: unknown[] }>;
      expect(timeline).toHaveLength(1);
      expect(timeline[0].date).toBe(TARGET_DATE);
      expect(timeline[0].items).toHaveLength(2);

      expect(resp.result?.answer_text).toContain('盖歇尔间歇泉');
      expect(resp.result?.answer_text).not.toContain('冰河湖');
      expect(resp.result?.answer_text).not.toContain('plan-philosophy-aligned');
      expect(resp.result?.answer_text).not.toContain('安全守护者 Abu');
      expect(resp.route.ui_hint.message).toBe('行程草案已更新');

      const poiCards = payload?.poi_cards as Array<{ date: string; day_index: number }>;
      expect(poiCards).toHaveLength(2);
      expect(poiCards.every((c) => c.date === TARGET_DATE)).toBe(true);
      expect(poiCards.map((c) => c.day_index)).toEqual([2, 2]);
      expect(payload?.poi_cards_meta).toMatchObject({
        itinerary_adjust_poi_scope_date: TARGET_DATE,
        suppress_answer_prose: true,
      });

      const adjust = payload?.itinerary_adjust_result as {
        draft_schedule_zh?: string[];
        optimization_summary_zh?: string;
        target_date_iso?: string;
      };
      expect(adjust).toBeDefined();
      expect(adjust?.target_date_iso).toBe(TARGET_DATE);
      expect(Array.isArray(adjust?.draft_schedule_zh)).toBe(true);
      expect(adjust?.draft_schedule_zh?.length).toBeGreaterThan(0);
      expect(adjust?.draft_schedule_zh?.some((line) => line.includes('盖歇尔间歇泉'))).toBe(true);
      expect(typeof adjust?.optimization_summary_zh).toBe('string');
      expect(adjust?.optimization_summary_zh?.trim().length).toBeGreaterThan(0);
    });

    it('detects adjust session from trip-bound message when metadata.route_and_run_intent is missing', async () => {
      const assembler = await createAssembler();
      const orchestrationResult: OrchestrationResult = {
        success: true,
        answerText: 'ignored',
        stepsExecuted: [],
        totalDuration: 1,
        result: {
          state: {
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
              day_by_day_narrative: [
                { day: 1, date: '2026-06-01', narrative: '第 1 天：冰河湖。' },
                { day: 2, date: TARGET_DATE, narrative: '第 2 天：黄金圈一带。' },
              ],
            },
            metadata: {
              started_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            },
          } as OrchestratorState,
          itinerary: {
            request_id: REQUEST_ID,
            days: buildSevenDayItineraryDays(),
          },
          gate_result: {
            gate_result: 'ALLOW',
            violations: [],
            required_adjustments: [],
            confidence: 0.8,
            evidence_refs: [],
          },
        },
      };

      const resp = await assembler.assembleClaudeStateMachineResponse({
        request: {
          request_id: REQUEST_ID,
          message: USER_MSG,
          trip_id: TRIP_ID,
        } as RouteAndRunRequestDto,
        startTime: Date.now(),
        orchestrationResult,
        routingTaskType: 'TRIP_PLANNING',
      });

      const payload = resp.result?.payload as Record<string, unknown>;
      expect(payload?.itinerary_adjust_intake).toBe(true);
      const timeline = payload?.timeline as Array<{ date: string }>;
      expect(timeline.map((d) => d.date)).toEqual([TARGET_DATE]);
    });
  });
});
