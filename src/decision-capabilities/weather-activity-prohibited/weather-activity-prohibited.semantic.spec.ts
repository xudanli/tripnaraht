import {
  WEATHER_ACTIVITY_PROHIBITED,
  buildWeatherActivityProhibitedSemanticKey,
  normalizeWeatherSemanticKey,
} from './weather-activity-prohibited.semantic';

describe('weather-activity-prohibited.semantic (WX)', () => {
  it('WX-001: builds canonical instance key', () => {
    expect(buildWeatherActivityProhibitedSemanticKey('evt_w1')).toBe(
      'WEATHER_ACTIVITY_PROHIBITED:evt_w1',
    );
  });

  it('WX-002: normalizes legacy rfc001 weather prefix', () => {
    expect(normalizeWeatherSemanticKey('rfc001:weather:evt_w1')).toBe(
      `${WEATHER_ACTIVITY_PROHIBITED}:evt_w1`,
    );
  });
});
