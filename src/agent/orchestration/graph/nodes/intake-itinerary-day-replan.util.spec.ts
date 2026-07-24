import {
  applyItineraryDayReplanIfRequested,
  shouldTerminalAfterItineraryDayReplan,
} from './intake-itinerary-day-replan.util';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

const GOLDEN_CIRCLE_MSG =
  '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。请生成新的行程草案。';

function minimalState(): OrchestratorState {
  return {
    request_id: 'req-test',
    current_step: 'INTAKE',
    decision_log: [],
    metadata: {},
    gaps: [{ type: 'MISSING_DESTINATION' } as never],
    clarification_questions: [{ question: 'q' } as never],
  } as OrchestratorState;
}

describe('intake-itinerary-day-replan.util', () => {
  it('applies day replan and sets terminal metadata', async () => {
    const state = minimalState();
    const host = {
      tryApplyBoundTripItineraryDayReplan: jest.fn().mockResolvedValue({
        applied: true,
        deletedCount: 4,
        addedCount: 3,
        answerText: '已将6月2日行程更新为黄金圈一日游。',
        skillsHit: ['trip.applyEdit'],
      }),
    };

    const handled = await applyItineraryDayReplanIfRequested(host, {
      message: GOLDEN_CIRCLE_MSG,
      tripId: 'trip-1',
      userId: 'user-1',
      state,
      dateRange: { start_date: '2026-06-01', end_date: '2026-06-02' },
    });

    expect(handled).toBe(true);
    expect(state.metadata.itinerary_day_replan_intake).toBe(true);
    expect(state.narration?.user_friendly_summary).toContain('黄金圈');
    expect(state.clarification_questions).toEqual([]);
    expect(shouldTerminalAfterItineraryDayReplan(state)).toBe(true);
  });

  it('skips when item CRUD already short-circuited', async () => {
    const state = minimalState();
    (state.metadata as Record<string, unknown>).itinerary_item_add_intake = true;
    const host = {
      tryApplyBoundTripItineraryDayReplan: jest.fn(),
    };

    const handled = await applyItineraryDayReplanIfRequested(host, {
      message: GOLDEN_CIRCLE_MSG,
      tripId: 'trip-1',
      state,
    });

    expect(handled).toBe(false);
    expect(host.tryApplyBoundTripItineraryDayReplan).not.toHaveBeenCalled();
  });
});
