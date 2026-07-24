import { ItinerarySlotPolisherService } from './itinerary-slot-polisher.service';
import type { PolisherContext } from './itinerary-slot-polisher.service';

describe('ItinerarySlotPolisherService', () => {
  const ctx: PolisherContext = {
    tripId: 'trip-1',
    dayNumber: 3,
    currentActivities: ['冰川徒步', '塞里雅兰瀑布'],
    baseReasonZh: '地理顺路，但当天已有冰川徒步等安排，行程较紧凑',
  };

  it('returns base when polisher is disabled', async () => {
    const config = {
      get: (key: string) => (key === 'DISABLE_ITINERARY_SLOT_POLISHER' ? 'true' : 300),
    };
    const svc = new ItinerarySlotPolisherService(config as any);
    await expect(svc.polishTightScheduleReason(ctx)).resolves.toBe(ctx.baseReasonZh);
  });

  it('returns base on LLM timeout (race)', async () => {
    const config = {
      get: (key: string) => (key === 'TRIP_POLISHER_TIMEOUT_MS' ? 40 : undefined),
    };
    const llm = {
      getDefaultProvider: () => 'DEEPSEEK',
      callLlmWithSchema: () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve(JSON.stringify({ polished_zh: '润色后文案' })), 200);
        }),
    };
    const svc = new ItinerarySlotPolisherService(config as any, llm as any);
    await expect(svc.polishTightScheduleReason(ctx)).resolves.toBe(ctx.baseReasonZh);
  });

  it('returns polished text when LLM responds in time', async () => {
    const config = {
      get: (key: string) => (key === 'TRIP_POLISHER_TIMEOUT_MS' ? 500 : undefined),
    };
    const llm = {
      getDefaultProvider: () => 'DEEPSEEK',
      callLlmWithSchema: async () =>
        JSON.stringify({
          polished_zh: '当天已有冰川徒步与瀑布，再加观鲸会偏赶，建议挪到相邻更空的一天。',
        }),
    };
    const svc = new ItinerarySlotPolisherService(config as any, llm as any);
    const out = await svc.polishTightScheduleReason(ctx);
    expect(out).toMatch(/观鲸/);
    expect(out).not.toBe(ctx.baseReasonZh);
  });
});
