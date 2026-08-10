import {
  applyEmptyTargetDayOptimizeHalt,
  buildEmptyTargetDayOptimizeAnswerZh,
  isFillEmptyDayArrangeIntent,
  isRouteOptimizeOnEmptyTargetDay,
} from './itinerary-adjust-empty-target-optimize.util';

describe('itinerary-adjust-empty-target-optimize', () => {
  it('detects optimize-route on empty day', () => {
    expect(
      isRouteOptimizeOnEmptyTargetDay({
        message: '优化一下第六天的路线',
        tripId: 't1',
        targetDayItemCount: 0,
      }),
    ).toBe(true);
  });

  it('does not halt when day has items or fill intent', () => {
    expect(
      isRouteOptimizeOnEmptyTargetDay({
        message: '优化一下第六天的路线',
        tripId: 't1',
        targetDayItemCount: 3,
      }),
    ).toBe(false);
    expect(isFillEmptyDayArrangeIntent('帮我安排第六天')).toBe(true);
    expect(
      isRouteOptimizeOnEmptyTargetDay({
        message: '帮我安排第六天',
        tripId: 't1',
        targetDayItemCount: 0,
      }),
    ).toBe(false);
  });

  it('writes honest adjust result and clears invent flags', () => {
    const state = {
      request_id: 'r1',
      metadata: { adaptive_replan_requested: true },
      itinerary: {
        days: [{ date: '2026-08-20', items: [{ name: 'fake' }] }],
      },
    } as any;
    const result = applyEmptyTargetDayOptimizeHalt(state, {
      targetDateIso: '2026-08-20',
      targetDayNumber: 6,
    });
    expect(result.status_label_zh).toBe('暂无行程');
    expect(result.draft_schedule_zh).toEqual([]);
    expect(result.chat_answer_text_zh).toContain('没有任何行程安排');
    expect(state.metadata.itinerary_adjust_empty_target_optimize).toBe(true);
    expect(state.metadata.adaptive_replan_requested).toBe(false);
    expect(state.itinerary.days[0].items).toEqual([]);
    expect(buildEmptyTargetDayOptimizeAnswerZh({ targetDateIso: '2026-08-20', targetDayNumber: 6 })).toContain(
      '第 6 天',
    );
  });
});
