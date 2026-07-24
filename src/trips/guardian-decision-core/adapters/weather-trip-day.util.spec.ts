import { windMsToKmh, resolveTripDayLocation } from './weather-trip-day.util';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';

describe('weather-trip-day.util', () => {
  it('WX-LIVE-001: converts m/s to km/h', () => {
    expect(windMsToKmh(25)).toBe(90);
  });

  it('WX-LIVE-002: resolves day coordinates from segment metadata', () => {
    const plan: RoutePlanDraft = {
      tripId: 't1',
      segments: [
        {
          segmentId: 's1',
          dayIndex: 2,
          metadata: { lat: 64.1, lng: -21.9, regionId: 'REYKJAVIK' },
        },
      ],
    };
    const loc = resolveTripDayLocation(plan, 2);
    expect(loc?.regionId).toBe('REYKJAVIK');
    expect(loc?.lat).toBe(64.1);
  });
});
