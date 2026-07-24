import {
  parseWindGustMps,
  parseWindSustainedMps,
  buildMetricsFromEnvironmentCopy,
} from './risk-metric-extraction.util';

describe('risk-metric-extraction.util', () => {
  it('parses wind range from harness copy', () => {
    const text =
      '预计 11:00 后阵风达到 16—18m/s，并将在 11:00—18:00 持续，可能影响冰川徒步和车辆稳定性';
    expect(parseWindSustainedMps(text)).toBe(18);
    expect(buildMetricsFromEnvironmentCopy(text)).toEqual({
      WIND_SUSTAINED_MPS: 18,
      WIND_GUST_MPS: 18,
    });
  });

  it('parses single wind speed', () => {
    expect(parseWindSustainedMps('sustained 12 m/s')).toBe(12);
    expect(parseWindGustMps('阵风达到 22m/s')).toBe(22);
  });
});
