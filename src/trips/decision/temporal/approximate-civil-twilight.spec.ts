import { approximateCivilTwilightLocal } from './approximate-civil-twilight';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

describe('approximateCivilTwilightLocal (suncalc)', () => {
  it('returns dusk after dawn for Reykjavik spring (Jun polar edge invalid in SunCalc)', () => {
    const r = approximateCivilTwilightLocal(
      '2026-05-01',
      64.1466,
      -21.9426,
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.ambiguous).not.toBe(true);
    expect(parseIsoTimeToMinutes(r!.civilDusk)).toBeGreaterThan(
      parseIsoTimeToMinutes(r!.civilDawn),
    );
  });

  it('handles Iceland winter short days', () => {
    const r = approximateCivilTwilightLocal(
      '2026-12-15',
      64.1466,
      -21.9426,
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.ambiguous).not.toBe(true);
    expect(parseIsoTimeToMinutes(r!.civilDusk)).toBeLessThan(
      18 * 60,
    );
  });
});
