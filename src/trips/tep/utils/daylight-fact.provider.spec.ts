import {
  clearDaylightFactCache,
  resolveDayGeoFromPlan,
  resolveDaylightFact,
} from './daylight-fact.provider';

describe('daylight-fact.provider', () => {
  beforeEach(() => clearDaylightFactCache());

  it('resolves July Reykjavik sunset when civil dusk is unavailable', () => {
    const fact = resolveDaylightFact({
      date: '2026-07-15',
      lat: 64.15,
      lng: -21.94,
      timezone: 'Atlantic/Reykjavik',
      maxMinutesAfterSunset: 30,
    });

    expect('degraded' in fact).toBe(false);
    if ('degraded' in fact) return;

    expect(fact.sunsetLocal).toMatch(/^\d{2}:\d{2}$/);
    expect(fact.sunsetMinutes).toBeGreaterThan(20 * 60);
    expect(fact.civilTwilightUnavailable).toBe(true);
    expect(fact.polarDay).toBe(true);
    expect(fact.polarNight).toBe(false);
    expect(fact.drivingCutoffMinutes).toBe(fact.sunsetMinutes + 30);
    expect(fact.source).toBe('sunset-fallback');
  });

  it('returns DAYLIGHT_DATA_MISSING without coordinates', () => {
    const fact = resolveDaylightFact({
      date: '2026-07-15',
      lat: Number.NaN,
      lng: -21.94,
    });
    expect('degraded' in fact).toBe(true);
    if (!('degraded' in fact)) return;
    expect(fact.degradationReason).toBe('DAYLIGHT_DATA_MISSING');
  });

  it('resolveDayGeoFromPlan averages origin and destination coords', () => {
    const geo = resolveDayGeoFromPlan({
      origin: { lat: 64.0, lng: -22.0 },
      destination: { lat: 66.0, lng: -20.0 },
      fallbackLat: 64.13,
      fallbackLng: -21.94,
    });
    expect(geo.lat).toBe(65);
    expect(geo.lng).toBe(-21);
  });
});
