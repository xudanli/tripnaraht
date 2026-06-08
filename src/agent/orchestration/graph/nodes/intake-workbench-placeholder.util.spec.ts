import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import {
  applyWorkbenchPlaceholderShortCircuitIfRequested,
  buildWorkbenchPlaceholderWelcomeText,
  shouldTerminalAfterWorkbenchPlaceholder,
} from './intake-workbench-placeholder.util';

describe('intake-workbench-placeholder.util', () => {
  const welcome =
    '行程助手 Nara  已关联当前行程  在这一页提问、检索攻略或说明想怎么改日程；我会带上当前行程上下文回答。 可选快捷语句：  查攻略 / 实况 检查日程是否合理 餐饮与停留';

  it('short-circuits bound trip placeholder welcome', () => {
    const state = {
      trip_plan_request: {
        destination: '冰岛',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-07' },
      },
      metadata: {},
      gaps: [{ type: 'MISSING_DESTINATION', severity: 'HARD', detail: 'x' }],
      clarification_questions: [{ id: 'destination_scope_too_sparse' }],
    } as unknown as OrchestratorState;

    const applied = applyWorkbenchPlaceholderShortCircuitIfRequested({
      message: welcome,
      tripId: 'trip-1',
      state,
    });
    expect(applied).toBe(true);
    expect(shouldTerminalAfterWorkbenchPlaceholder(state)).toBe(true);
    expect(state.clarification_questions).toEqual([]);
    expect(state.gaps).toEqual([]);
    expect(state.narration?.user_friendly_summary).toContain('2026-06-01');
  });

  it('does not short-circuit real hotel ask', () => {
    const state = {
      trip_plan_request: { destination: '冰岛' },
      metadata: {},
    } as unknown as OrchestratorState;
    expect(
      applyWorkbenchPlaceholderShortCircuitIfRequested({
        message: '第二天的行程给我推荐酒店，并且最好离第三天的行程要近',
        tripId: 'trip-1',
        state,
      }),
    ).toBe(false);
  });

  it('builds welcome text from trip plan request', () => {
    const text = buildWorkbenchPlaceholderWelcomeText({
      trip_plan_request: {
        destination: '冰岛',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-07' },
      },
    } as OrchestratorState);
    expect(text).toContain('冰岛');
    expect(text).toContain('推荐酒店');
  });
});
