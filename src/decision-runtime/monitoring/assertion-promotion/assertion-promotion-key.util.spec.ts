import { resolvePromotionKey } from './assertion-promotion-key.util';

describe('assertion-promotion-key.util', () => {
  it('builds stable weather hazard key by day', () => {
    expect(
      resolvePromotionKey({
        signal: 'ASSERTION_EMITTED',
        predicate: 'weather.hazard',
        dayIndex: 1,
      }),
    ).toBe('weather:hazard:day:1:WEATHER_ACTIVITY_PROHIBITED');
  });

  it('builds independent recovery key', () => {
    expect(
      resolvePromotionKey({
        signal: 'RECOVERY_OBSERVED',
        predicate: 'weather.hazard',
        dayIndex: 1,
      }),
    ).toBe('weather:recovery:day:1:RECOVERY_OBSERVED');
  });

  it('builds road hazard key', () => {
    expect(
      resolvePromotionKey({
        signal: 'ASSERTION_EMITTED',
        predicate: 'road.status',
        roadId: 'f208',
      }),
    ).toBe('road:hazard:F208:ROAD_SEGMENT_UNAVAILABLE');
  });
});
