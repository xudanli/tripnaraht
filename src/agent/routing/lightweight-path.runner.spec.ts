import {
  runItineraryDayViewPath,
  runWorkbenchPlaceholderPath,
} from './lightweight-path.runner';
import type { LightweightTripLookupHost } from './lightweight-path.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';

describe('lightweight-path.runner', () => {
  const request = {
    request_id: 'r1',
    user_id: 'u1',
    trip_id: 't1',
    message: '查看第2天行程',
  } as RouteAndRunRequestDto;
  const context = { tripId: 't1' } as AgentContext;
  const startTime = Date.now() - 5;

  it('runWorkbenchPlaceholderPath returns welcome without trip service', async () => {
    const host: LightweightTripLookupHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    };
    const out = await runWorkbenchPlaceholderPath(host, request, context, startTime);
    expect(out.success).toBe(true);
    expect(out.result.workbench_assistant_placeholder).toBe(true);
    expect(out.answerText.length).toBeGreaterThan(0);
  });

  it('runItineraryDayViewPath reads day from trip', async () => {
    const host: LightweightTripLookupHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      findTripForLightweight: async () => ({
        destination: '冰岛',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        TripDay: [
          { date: '2026-06-01', ItineraryItem: [{ title: 'Day1' }] },
          {
            date: '2026-06-02',
            ItineraryItem: [{ title: '蓝湖' }, { title: '雷克雅未克' }],
          },
        ],
      }),
    };
    const out = await runItineraryDayViewPath(host, request, context, startTime);
    expect(out.success).toBe(true);
    expect(out.result.itinerary_day_view_intake).toBe(true);
    expect(out.answerText).toMatch(/蓝湖|第\s*2\s*天|第二天/);
  });

  it('runItineraryDayViewPath fails without trip lookup', async () => {
    const host: LightweightTripLookupHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    };
    const out = await runItineraryDayViewPath(host, request, context, startTime);
    expect(out.success).toBe(false);
    expect(out.answerText).toContain('无法读取行程');
  });
});
