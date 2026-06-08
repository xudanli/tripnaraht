import {
  buildItineraryAdjustOptimizationResult,
  buildItineraryAdjustScheduleChangeBullets,
  buildItineraryAdjustUserFacingBullets,
  buildItineraryAdjustUserIntentEchoZh,
  coalesceItineraryAdjustOptimizationResult,
} from './itinerary-adjust-optimization-summary.util';

describe('itinerary-adjust-optimization-summary', () => {
  it('echoes pacing intent and explains schedule diff in user-facing bullets', () => {
    const echo = buildItineraryAdjustUserIntentEchoZh({
      metadata: {
        intake_user_message: '明天太累了，轻松一点',
        adaptive_replan_trigger: 'pacing',
      },
      targetDateIso: '2026-06-06',
      targetDayNumber: 6,
    });
    expect(echo).toContain('更轻松');
    expect(echo).toContain('第 6 天');

    const changes = buildItineraryAdjustScheduleChangeBullets(
      [
        { name: '米湖自然温泉', start_window: '13:55', end_window: '15:15', type: 'POI' },
        { name: '众神瀑布', start_window: '09:00', end_window: '10:40', type: 'POI' },
      ],
      [
        { name: '米湖自然温泉', start_window: '09:00', end_window: '11:00', type: 'POI' },
        { name: '众神瀑布', start_window: '11:00', end_window: '13:00', type: 'POI' },
      ],
    );
    expect(changes.some((l) => l.includes('米湖自然温泉') && l.includes('提前'))).toBe(true);

    const relaxedSchedule = [
      { name: '众神瀑布', start_window: '2026-06-06T11:00', end_window: '2026-06-06T13:00', type: 'POI' },
      {
        name: '午间景观路段留白',
        start_window: '2026-06-06T13:00',
        end_window: '2026-06-06T14:00',
        type: 'REST',
      },
      {
        name: '米湖自然温泉',
        start_window: '2026-06-06T14:00',
        end_window: '2026-06-06T16:00',
        type: 'POI',
      },
    ];
    const result = buildItineraryAdjustOptimizationResult({
      targetDateIso: '2026-06-06',
      targetDayNumber: 6,
      poiNames: ['众神瀑布', '米湖自然温泉'],
      scheduleItems: relaxedSchedule,
      metadata: {
        intake_user_message: '明天太累了，轻松一点',
        adaptive_replan_trigger: 'pacing',
        adaptive_replan_rationale_zh: ['疲劳/节奏控制：移除次要高消耗 POI「黑沙滩」'],
        experience_curator_rationale_zh: [
          '冰火感官顺序：上午先「众神瀑布」，下午再进入「米湖自然温泉」疗愈收束。',
        ],
        itinerary_adjust_cross_day_excluded_count: 13,
        itinerary_adjust_corridor_fallback_level: 'expanded_120km',
        itinerary_adjust_baseline_schedule: [
          { name: '米湖自然温泉', start_window: '13:55', end_window: '15:15', type: 'POI' },
          { name: '众神瀑布', start_window: '09:00', end_window: '10:40', type: 'POI' },
        ],
        itinerary_adjust_execution_mode: 'ADVICE_ONLY',
      },
    });
    expect(result.user_intent_echo_zh).toContain('更轻松');
    expect(result.schedule_change_bullets_zh ?? []).toHaveLength(0);
    expect(result.rationale_bullets_zh.some((b) => /热量|动线|微气候/.test(b))).toBe(true);
    expect(result.rationale_bullets_zh.some((b) => /众神瀑布|米湖自然温泉/.test(b))).toBe(true);
    expect(result.experience_validation?.reasoning_type).toBe('EXPERIENCE_METRIC_VALIDATION');
    expect(result.experience_validation?.region_profile).toBe('myvatn_north_iceland');
    expect(result.experience_validation?.evidence_facts.route_efficiency).toMatch(/40/);
    expect(result.rationale_bullets_zh.some((b) => b.includes('重复景点'))).toBe(false);
    expect(result.rationale_bullets_zh.some((b) => b.includes('闭园'))).toBe(false);
    expect(result.rationale_bullets_zh.some((b) => b.includes('→'))).toBe(false);
    expect(result.rationale_bullets_zh.some((b) => b.includes('驾驶走廊'))).toBe(false);
    expect(result.display_title_zh).toContain('环米湖松弛疗愈');
    expect(result.optimization_summary_zh).not.toContain('选点说明');
  });

  it('formats schedule change without 由 从 duplicate wording', () => {
    const changes = buildItineraryAdjustScheduleChangeBullets(
      [{ name: '众神瀑布', start_window: '09:00', type: 'POI' }],
      [{ name: '众神瀑布', start_window: '11:00', end_window: '13:00', type: 'POI' }],
    );
    expect(changes[0]).toMatch(/众神瀑布.*09:00.*11:00–13:00/);
    expect(changes[0]).not.toContain('由 从');
  });

  it('builds draft summary with corridor rationale', () => {
    const result = buildItineraryAdjustOptimizationResult({
      targetDateIso: '2026-06-02',
      targetDayNumber: 2,
      poiNames: ['斯科加瀑布', '塞里雅兰瀑布'],
      scheduleItems: [
        { name: '维克超市', start_window: '10:00', end_window: '12:00', type: 'SHOPPING' },
        { name: '斯卡夫塔山国家公园', start_window: '11:00', end_window: '13:00', type: 'POI' },
        { name: '斯科加瀑布', start_window: '13:00', end_window: '15:00', type: 'POI' },
      ],
      metadata: {
        itinerary_adjust_execution_mode: 'ADVICE_ONLY',
        itinerary_adjust_corridor_fallback_level: 'baseline_50km',
        itinerary_adjust_neighbor_anchors: {
          targetDateIso: '2026-06-02',
          targetDayNumber: 2,
          startAnchor: { lat: 63.42, lng: -19.0 },
          endAnchor: { lat: 64.84, lng: -23.27 },
          startAnchorSource: 'prev_day_last',
          endAnchorSource: 'next_day_first',
        },
      },
    });
    expect(result.status_label_zh).toBe('草案待确认');
    expect(result.draft_card_body_zh).toBeUndefined();
    expect(result.route_context_zh).toContain('前一天行程最后停留点');
    expect(result.optimization_summary_zh).not.toContain('前一天行程最后停留点');
    expect(result.optimization_summary_zh).not.toContain('10:00–12:00');
    expect(result.draft_schedule_zh.length).toBe(3);
    expect(result.chat_answer_text_zh).not.toContain('维克超市');
    expect(result.chat_answer_text_zh).not.toContain('当日安排');
    expect(result.apply_confirmation_zh).toContain('上方草案日程');
    expect(result.apply_confirmation_zh).not.toContain('10:00–12:00');
    expect(result.apply_confirmation_lines).toEqual([]);
    expect(result.apply_hint_zh).toBe('确认无误后点击「应用到行程」。');
    expect(result.suppress_chat_lead).toBe(true);
    expect(result.display_title_zh).toBe('第 2 天（2026-06-02）');
    expect(result.poi_selection_rationale_zh?.length).toBeGreaterThan(0);
    expect(result.poi_selection_rationale_zh?.some((l) => l.includes('互斥') || l.includes('二选一'))).toBe(
      true,
    );
    expect(result.optimization_summary_zh).not.toMatch(/^第 2 天（2026-06-02）/);
  });

  it('coalesce preserves draft_schedule_zh when timeline rebuild is empty', () => {
    const existing = buildItineraryAdjustOptimizationResult({
      targetDateIso: '2026-06-02',
      targetDayNumber: 2,
      poiNames: ['维克超市'],
      scheduleItems: [
        { name: '维克超市', start_window: '10:00', end_window: '12:00', type: 'SHOPPING' },
      ],
      metadata: { itinerary_adjust_execution_mode: 'ADVICE_ONLY' },
    });
    const rebuilt = buildItineraryAdjustOptimizationResult({
      targetDateIso: '2026-06-02',
      targetDayNumber: 2,
      poiNames: [],
      scheduleItems: [],
      metadata: { itinerary_adjust_execution_mode: 'ADVICE_ONLY' },
    });
    const merged = coalesceItineraryAdjustOptimizationResult(rebuilt, existing);
    expect(merged.draft_schedule_zh).toEqual(existing.draft_schedule_zh);
    expect(merged.optimization_summary_zh.trim().length).toBeGreaterThan(0);
  });
});
