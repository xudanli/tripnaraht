import { shouldEnableLiveWeatherMcpForLightweightRoute } from './orchestration-signals.util';

describe('shouldEnableLiveWeatherMcpForLightweightRoute', () => {
  it('DATA_LOOKUP: 行程内「天气+路况+近期注意」未开 live_facts 也启用（对齐用户咨询话术）', () => {
    expect(
      shouldEnableLiveWeatherMcpForLightweightRoute(
        'DATA_LOOKUP',
        '结合当前行程，帮我汇总目的地近期需要注意的天气与路况',
        {},
      ),
    ).toBe(true);
  });

  it('DATA_LOOKUP: 仍尊重 enable_live_tools.weather', () => {
    expect(
      shouldEnableLiveWeatherMcpForLightweightRoute('DATA_LOOKUP', '随便问问', {
        enable_live_tools: ['weather'],
      }),
    ).toBe(true);
  });

  it('DATA_LOOKUP: live_facts + 天气关键词', () => {
    expect(
      shouldEnableLiveWeatherMcpForLightweightRoute('DATA_LOOKUP', '雷克雅未克明天天气', {
        intent_flags: { live_facts: true },
      }),
    ).toBe(true);
  });

  it('DATA_LOOKUP: 纯租车话术不因天气子串误开（isWeatherRoadConditionFocusedQuery 排除 carPrimary）', () => {
    expect(
      shouldEnableLiveWeatherMcpForLightweightRoute(
        'DATA_LOOKUP',
        '租车自驾天气路况要注意什么',
        {},
      ),
    ).toBe(false);
  });

  it('TRIP_PLANNING: 不启用（非轻量路径）', () => {
    expect(
      shouldEnableLiveWeatherMcpForLightweightRoute(
        'TRIP_PLANNING',
        '结合当前行程，帮我汇总目的地近期需要注意的天气与路况',
        {},
      ),
    ).toBe(false);
  });
});
