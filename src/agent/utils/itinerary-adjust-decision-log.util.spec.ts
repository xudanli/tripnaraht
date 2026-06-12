import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  extractPoiDigestFromItinerary,
  filterDecisionLogVerifyToDraftPois,
  filterVerifyIssuesToAdjustTarget,
  formatItineraryDayPoiDigestZh,
  formatPoiSelectionOutputsAdjustZh,
  pruneStaleVerifyDecisionLogForAdjustTarget,
  captureItineraryAdjustBaselineSchedule,
  refreshItineraryAdjustOptimizationResult,
  resolveItineraryAdjustRunContext,
  scopeOrchestratorNarrationToAdjustTarget,
} from './itinerary-adjust-decision-log.util';

describe('itinerary-adjust-decision-log', () => {
  it('resolveItineraryAdjustRunContext reads target day from metadata', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-02',
        route_and_run_intent: { primary: 'ITINERARY_ADJUST' },
        intake_user_message: '重新规划第二天',
      },
    } as unknown as OrchestratorState;
    const ctx = resolveItineraryAdjustRunContext(state);
    expect(ctx.active).toBe(true);
    expect(ctx.targetDateIso).toBe('2026-06-02');
    expect(ctx.subIntent).toBe('strong_modification');
  });

  it('extractPoiDigestFromItinerary builds day → POI digest', () => {
    const digest = extractPoiDigestFromItinerary({
      days: [
        {
          date: '2026-11-01',
          items: [{ type: 'POI', location_ref: { name: '冰河湖' } }],
        },
        {
          date: '2026-11-02',
          items: [
            { type: 'POI', location_ref: { name: '钻石沙滩' } },
            { type: 'DRIVE', location_ref: { name: 'ignore' } },
          ],
        },
      ],
    } as OrchestratorState['itinerary']);
    expect(digest).toHaveLength(2);
    expect(digest[0].poiNames).toEqual(['冰河湖']);
    expect(digest[1].poiNames).toEqual(['钻石沙滩']);
  });

  it('formatItineraryDayPoiDigestZh renders concrete day lines', () => {
    const text = formatItineraryDayPoiDigestZh([
      { dayNumber: 1, dateIso: '2026-11-01', poiNames: ['冰河湖', '钻石沙滩'] },
      { dayNumber: 2, dateIso: '2026-11-02', poiNames: ['维克'] },
    ]);
    expect(text).toContain('日程要点');
    expect(text).toContain('第1天（11/1）冰河湖、钻石沙滩');
    expect(text).toContain('第2天（11/2）维克');
  });

  it('formatPoiSelectionOutputsAdjustZh clarifies pool vs recall', () => {
    const text = formatPoiSelectionOutputsAdjustZh({
      researchRecallCount: 5,
      scoringPoolCount: 12,
      selectedCount: 2,
      selectedNames: ['斯科加瀑布', '塞里雅兰瀑布'],
      metadata: { itinerary_adjust_corridor_fallback_level: 'baseline_50km' },
    });
    expect(text).toContain('检索召回 5');
    expect(text).toContain('合并打分池 12');
    expect(text).toContain('入选 2');
  });

  it('captureItineraryAdjustBaselineSchedule snapshots bound trip day before replan', () => {
    const metadata: Record<string, unknown> = {};
    captureItineraryAdjustBaselineSchedule(metadata, '2026-06-06', {
      tripDayRows: [
        {
          dateIso: '2026-06-06',
          dayNumber: 6,
          items: [
            {
              name: '米湖自然温泉',
              type: 'POI',
              startTime: new Date('2026-06-06T13:55:00Z'),
            },
          ],
        },
      ],
    });
    expect(metadata.itinerary_adjust_baseline_schedule).toEqual([
      expect.objectContaining({ name: '米湖自然温泉', start_window: '13:55' }),
    ]);
  });

  it('refresh applies pacing relax so hotspring moves to afternoon (myvatn bad case)', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-06',
        itinerary_adjust_neighbor_anchors: { targetDayNumber: 6, targetDateIso: '2026-06-06' },
        intake_user_message: '明天太累了，轻松一点',
        adaptive_replan_trigger: 'pacing',
      },
      itinerary: {
        days: [
          {
            date: '2026-06-06',
            items: [
              {
                id: 'hs',
                type: 'POI',
                start_window: '2026-06-06T09:00',
                end_window: '2026-06-06T11:00',
                location_ref: { name: '米湖自然温泉' },
              },
              {
                id: 'wf',
                type: 'POI',
                start_window: '2026-06-06T11:00',
                end_window: '2026-06-06T13:00',
                location_ref: { name: '众神瀑布' },
              },
            ],
          },
        ],
      },
    } as unknown as OrchestratorState;
    refreshItineraryAdjustOptimizationResult(state);
    const day = state.itinerary?.days?.[0];
    const hs = day?.items.find((it) => it.location_ref?.name === '米湖自然温泉');
    const wf = day?.items.find((it) => it.location_ref?.name === '众神瀑布');
    expect(hs?.start_window).toContain('T14:00');
    expect(wf?.start_window).toContain('T11:00');
    expect(day?.items.some((it) => it.type === 'REST')).toBe(true);
    const result = state.metadata?.itinerary_adjust_result as {
      draft_schedule_zh?: string[];
      experience_validation?: { reasoning_type?: string };
      rationale_bullets_zh?: string[];
    };
    expect(result?.draft_schedule_zh?.join('\n')).toMatch(/14:00.*米湖自然温泉/);
    expect(result?.experience_validation?.reasoning_type).toBe('EXPERIENCE_METRIC_VALIDATION');
    expect(result?.rationale_bullets_zh?.join('\n')).toMatch(/热量|动线|40/);
  });

  it('refreshItineraryAdjustOptimizationResult writes draft from post-replan itinerary', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-02',
        itinerary_adjust_neighbor_anchors: { targetDayNumber: 2, targetDateIso: '2026-06-02' },
        adaptive_replan_rationale_zh: ['疲劳/节奏控制：移除次要高消耗 POI「黑沙滩」'],
      },
      itinerary: {
        days: [
          {
            date: '2026-06-02',
            items: [
              {
                type: 'POI',
                start_window: '10:00',
                end_window: '12:00',
                location_ref: { name: '斯科加瀑布' },
              },
              {
                type: 'REST',
                start_window: '15:00',
                end_window: '16:00',
                location_ref: { name: '休息空档' },
              },
            ],
          },
        ],
      },
    } as unknown as OrchestratorState;
    refreshItineraryAdjustOptimizationResult(state);
    const result = state.metadata?.itinerary_adjust_result as {
      draft_schedule_zh?: string[];
      optimization_summary_zh?: string;
    };
    expect(result?.draft_schedule_zh?.some((l) => l.includes('斯科加瀑布'))).toBe(true);
    expect(result?.optimization_summary_zh).toContain('第 2 天');
    expect(result?.optimization_summary_zh).not.toContain('选点说明');
  });

  it('scopeOrchestratorNarrationToAdjustTarget keeps only target day', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-02',
        itinerary_adjust_neighbor_anchors: { targetDayNumber: 2, targetDateIso: '2026-06-02' },
      },
      narration: {
        day_by_day_narrative: [
          { day: 1, date: '2026-06-01', narrative: '第1天' },
          { day: 2, date: '2026-06-02', narrative: '第2天南岸' },
        ],
        highlights: [],
        tips: [],
      },
      itinerary: {
        days: [
          {
            date: '2026-06-02',
            items: [{ type: 'POI', location_ref: { name: '斯科加瀑布' } }],
          },
        ],
      },
    } as unknown as OrchestratorState;
    scopeOrchestratorNarrationToAdjustTarget(state);
    expect(state.narration?.day_by_day_narrative).toHaveLength(1);
    expect(state.narration?.day_by_day_narrative?.[0].date).toBe('2026-06-02');
    expect(state.metadata?.itinerary_adjust_result).toBeDefined();
  });

  it('filterVerifyIssuesToAdjustTarget scopes by day iso or target day item id', () => {
    const issues = filterVerifyIssuesToAdjustTarget(
      [
        { day: '2026-06-01', item_id: 'a' },
        { day: '2026-06-02', item_id: 'b' },
        { entityRef: { id: 'c' }, message: 'POI "斯科加瀑布" 在 2026-06-02 09:00' },
      ],
      '2026-06-02',
      [{ id: 'c' }],
    );
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.item_id ?? i.entityRef?.id)).toEqual(['b', 'c']);
  });

  it('filterDecisionLogVerifyToDraftPois drops non-draft opening hours lines', () => {
    const log = filterDecisionLogVerifyToDraftPois(
      [
        {
          request_id: 'r1',
          step: 'VERIFY',
          actor: 'Orchestrator',
          inputs_summary: 'kernel',
          outputs_summary:
            '开放时间冲突：「斯卡夫塔山国家公园」在你安排的 11:00–13:00 时段可能闭馆或不可进入；建议改时段或替换景点。',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: { rule_id: 'temporal_opening_v1' },
        },
        {
          request_id: 'r1',
          step: 'VERIFY',
          actor: 'Orchestrator',
          inputs_summary: 'kernel',
          outputs_summary:
            '开放时间冲突：「斯科加瀑布」在你安排的 09:00–11:00 时段可能闭馆或不可进入；建议改时段或替换景点。',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: { rule_id: 'temporal_opening_v1' },
        },
      ],
      ['斯科加瀑布'],
    );
    expect(log).toHaveLength(1);
    expect(log[0].outputs_summary).toContain('斯科加瀑布');
  });

  it('pruneStaleVerifyDecisionLogForAdjustTarget removes non-draft verify rows', () => {
    const state = {
      metadata: {
        itinerary_adjust_intake: true,
        itinerary_adjust_target_date_iso: '2026-06-02',
      },
      itinerary: {
        days: [
          {
            date: '2026-06-02',
            items: [{ type: 'POI', location_ref: { name: '斯科加瀑布' } }],
          },
        ],
      },
      decision_log: [
        {
          request_id: 'r1',
          step: 'VERIFY',
          actor: 'Orchestrator',
          inputs_summary: 'x',
          outputs_summary: '开放时间冲突：「维克超市」在你安排的 09:00–11:00 时段可能闭馆或不可进入；建议改时段或替换景点。',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
        },
        {
          request_id: 'r1',
          step: 'VERIFY',
          actor: 'Orchestrator',
          inputs_summary: 'x',
          outputs_summary: '目标日可执行性 0 条',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
        },
      ],
    } as unknown as OrchestratorState;
    pruneStaleVerifyDecisionLogForAdjustTarget(state);
    expect(state.decision_log).toHaveLength(1);
    expect(state.decision_log?.[0].outputs_summary).toContain('目标日');
  });
});
