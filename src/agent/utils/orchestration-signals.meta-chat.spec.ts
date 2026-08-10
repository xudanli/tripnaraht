import { isMetaChatQuery, signalsFromRequest } from './orchestration-signals.util';
import { classifyRouteAndRunRouteClass } from '../routing/route-and-run-route-class.util';

describe('isMetaChatQuery — UI day schedule suffix', () => {
  it('treats greeting + trailing [日程] DayN as meta chat', () => {
    const msg = '您好\n\n[日程] Day2 Day 2 · 黄金圈';
    expect(isMetaChatQuery(msg, msg.toLowerCase())).toBe(true);
  });

  it('routes greeting+日程 to DATA_LOOKUP / QUICK_ANSWER when trip-bound', () => {
    const msg = '您好\n\n[日程] Day1 Day 1 · 抵达雷克雅未克';
    const req = {
      request_id: 't',
      trip_id: 'trip-1',
      message: msg,
      conversation_context: { context_type: 'active_trip_summary' as const },
      options: { entry_point: 'agent_chat' as const },
    };
    expect(signalsFromRequest(req as any).taskType).toBe('DATA_LOOKUP');
    expect(classifyRouteAndRunRouteClass(req as any).routeClass).toBe('QUICK_ANSWER');
  });
});
