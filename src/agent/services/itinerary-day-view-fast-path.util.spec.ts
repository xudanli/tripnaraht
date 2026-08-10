import { tryBuildItineraryDayViewFastPath } from './itinerary-day-view-fast-path.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('tryBuildItineraryDayViewFastPath', () => {
  const baseRequest = {
    request_id: 'r-day-view',
    user_id: 'u1',
    trip_id: 't1',
    message: '给我看看第二天的行程',
    options: { execution_mode: 'ADVICE_ONLY', async_mode: 'OFF' },
  } as RouteAndRunRequestDto;

  it('returns null when message is not day-view', async () => {
    const out = await tryBuildItineraryDayViewFastPath(
      {
        claudeOrchestrator: {
          tripsService: { findOne: async () => ({ TripDay: [] }) },
        },
      },
      { ...baseRequest, message: '帮我重排南岸行程' },
    );
    expect(out).toBeNull();
  });

  it('bypasses kernel and returns conversation_turn_result', async () => {
    const out = await tryBuildItineraryDayViewFastPath(
      {
        logger: { log: jest.fn() },
        claudeOrchestrator: {
          tripsService: {
            findOne: async () => ({
              destination: '冰岛',
              startDate: '2026-06-01',
              endDate: '2026-06-05',
              TripDay: [
                { date: '2026-06-01', ItineraryItem: [] },
                {
                  date: '2026-06-02',
                  ItineraryItem: [
                    { note: '蓝湖', Place: { nameCN: '蓝湖' } },
                  ],
                },
              ],
            }),
          },
        },
      },
      baseRequest,
    );
    expect(out).not.toBeNull();
    expect(out!.observability.orchestration_mode_final).toBe('CLAUDE_DYNAMIC');
    expect((out!.observability as any).itinerary_day_view_fast_path).toBe(true);
    expect(out!.result.status).toBe('OK');
    expect(out!.result.answer_text).toMatch(/蓝湖|第\s*2\s*天/);
    const turn = (out!.result.payload as any).conversation_turn_result;
    expect(turn?.schema_id).toBe('tripnara.conversation_turn_result@v1');
    expect(turn?.primary_card).toBe('trip_fact');
    expect(turn?.cards?.some((c: { kind: string }) => c.kind === 'trip_fact')).toBe(true);
    expect(turn?.cards?.some((c: { kind: string }) => c.kind === 'gate_risk')).toBe(false);
    expect((out!.result.payload as any).day_view?.body_zh).toBeTruthy();
  });

  it('returns null without tripsService', async () => {
    const out = await tryBuildItineraryDayViewFastPath({}, baseRequest);
    expect(out).toBeNull();
  });
});
