import { resolveExperienceSolarTimes } from './experience-curator-solar.util';

describe('resolveExperienceSolarTimes', () => {
  it('computes late June sunset for Vik via SunCalc (not month hardcode)', () => {
    const solar = resolveExperienceSolarTimes({
      dateIso: '2026-06-05',
      lat: 63.4186,
      lng: -19.0059,
    });

    expect(solar.source).toBe('suncalc');
    const sunsetHour = solar.sunset.hour;
    expect(sunsetHour).toBeGreaterThanOrEqual(21);
    expect(solar.goldenHourStart.toMillis()).toBeLessThan(solar.sunset.toMillis());
    expect(solar.sunrise.toFormat('HH:mm')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('falls back to Reykjavik when coordinates omitted', () => {
    const solar = resolveExperienceSolarTimes({ dateIso: '2026-12-15' });
    expect(solar.lat).toBeCloseTo(64.1466, 2);
    expect(solar.sunset.hour).toBeLessThan(18);
  });
});
