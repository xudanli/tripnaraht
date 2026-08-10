import {
  lodgingHoursFromHotelPlace,
  lodgingHoursFromOpeningRaw,
  mapOsmOpeningHoursToLodgingOpeningMode,
} from './map-osm-to-lodging-opening-mode';
import { mergeLodgingIntoRouteFacts } from './merge-lodging-into-route-facts';
import { resolveLodgingHoursFromPlan } from './resolve-lodging-hours-from-plan';
import { assessLodgingHours } from './assess-iceland-winter-knowledge';
import { evaluateIcelandSelfDriveSituation } from '../demo/evaluate-iceland-self-drive-situation';
import { projectIcelandSelfDriveSituationClient } from '../demo/iceland-self-drive-situation.client';
import type { TripPlan } from '../../../../trips/decision/plan-model';

describe('lodging opening hours mapping', () => {
  it('maps empty → UNKNOWN', () => {
    expect(mapOsmOpeningHoursToLodgingOpeningMode(null)).toBe('UNKNOWN');
    expect(mapOsmOpeningHoursToLodgingOpeningMode('')).toBe('UNKNOWN');
  });

  it('maps seasonal keywords → SEASONAL_REDUCED', () => {
    expect(mapOsmOpeningHoursToLodgingOpeningMode('seasonal winter only')).toBe(
      'SEASONAL_REDUCED',
    );
  });

  it('maps non-empty schedule → KNOWN without inventing clocks', () => {
    expect(mapOsmOpeningHoursToLodgingOpeningMode('Mo-Su 15:00-22:00')).toBe(
      'KNOWN',
    );
  });

  it('hotel Place without OH → hoursUnknown', () => {
    const lodging = lodgingHoursFromHotelPlace({ metadata: {} });
    expect(lodging.openingMode).toBe('UNKNOWN');
    expect(lodging.hoursUnknown).toBe(true);
    expect(assessLodgingHours(lodging).gate).toBe('NEED_CONFIRM');
  });

  it('resolves from plan hotel slot + Place OH map', () => {
    const plan = {
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 'h1',
              time: '20:00',
              title: 'Hotel',
              type: 'hotel',
              poiId: '42',
            },
          ],
        },
      ],
    } as TripPlan;
    const unknown = resolveLodgingHoursFromPlan({ plan });
    expect(unknown?.hoursUnknown).toBe(true);

    const known = resolveLodgingHoursFromPlan({
      plan,
      openingHoursByPoiId: { '42': 'Mo-Su 16:00-23:00' },
    });
    expect(known?.openingMode).toBe('KNOWN');
    expect(known?.hoursUnknown).toBe(false);
  });

  it('projects lodging on Situation client', () => {
    const lodging = lodgingHoursFromOpeningRaw({ forceUnknown: true });
    const result = evaluateIcelandSelfDriveSituation({
      vehicleRoadFit: {
        vehicleClass: 'SEDAN',
        roadSegmentId: 'RING_ROAD',
        roadBaseType: 'PAVED',
        roadStatus: 'OPEN',
      },
      winter: { lodging },
      executeFuelRunbookOnBlock: false,
    });
    const client = projectIcelandSelfDriveSituationClient(result);
    expect(client.lodging?.hoursUnknown).toBe(true);
    expect(client.lodging?.recommendedActions).toContain(
      'CONFIRM_CHECK_IN_WINDOW',
    );
    expect(client.gate).toBe('NEED_CONFIRM');
  });

  it('mergeLodgingIntoRouteFacts preserves upstream', () => {
    const merged = mergeLodgingIntoRouteFacts(
      { winter: { lodging: { openingMode: 'KNOWN', hoursUnknown: false } } },
      { openingMode: 'UNKNOWN', hoursUnknown: true },
    );
    expect(merged.winter?.lodging?.openingMode).toBe('KNOWN');
  });
});
