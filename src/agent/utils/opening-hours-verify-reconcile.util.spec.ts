import type { Itinerary } from '../interfaces/trip-plan.interface';
import { VERIFY_SYNTHETIC_VIOLATION_PREFIX } from './merge-verify-issues-into-gate.util';
import {
  isOpeningHoursScheduledTimeStaleForItinerary,
  isOpeningHoursVerifyIssueFalsePositive,
  shouldSuppressOpeningHoursVerifyIssue,
} from './opening-hours-verify-reconcile.util';

const summerItinerary: Itinerary = {
  request_id: 't1',
  days: [
    {
      date: '2026-06-03',
      items: [
        {
          id: 'skaftafell',
          type: 'POI',
          start_window: '11:30',
          end_window: '14:00',
          location_ref: { place_id: '381041', name: '斯卡夫塔山国家公园' },
          evidence_refs: [],
        },
      ],
    },
  ],
};

const researchData = {
  country_code: 'IS',
  opening_hours_evidence: [
    {
      poi_id: '381041',
      opening_hours: 'Summer 8:00-18:00, Winter 9:00-17:00',
    },
  ],
};

describe('opening-hours-verify-reconcile.util', () => {
  it('flags stale when verify message time differs from current start_window', () => {
    const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} POI_CLOSED [entity:POI:skaftafell]: POI "斯卡夫塔山国家公园" 在 09:00 不在开放时间内`;
    expect(isOpeningHoursScheduledTimeStaleForItinerary(detail, summerItinerary)).toBe(true);
  });

  it('suppresses false positive for summer hours at 11:30', () => {
    const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} POI_CLOSED [entity:POI:skaftafell]: POI "斯卡夫塔山国家公园" 在 11:30 不在开放时间内`;
    expect(isOpeningHoursVerifyIssueFalsePositive(detail, summerItinerary, researchData)).toBe(true);
    expect(shouldSuppressOpeningHoursVerifyIssue(detail, summerItinerary, researchData)).toBe(true);
  });

  it('does not suppress when visit is before summer opening', () => {
    const earlyItinerary: Itinerary = {
      ...summerItinerary,
      days: [
        {
          ...summerItinerary.days![0],
          items: [
            {
              ...summerItinerary.days![0].items![0],
              start_window: '07:00',
              end_window: '08:30',
            },
          ],
        },
      ],
    };
    const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} POI_CLOSED: POI "斯卡夫塔山国家公园" 在 07:00 不在开放时间内`;
    expect(isOpeningHoursVerifyIssueFalsePositive(detail, earlyItinerary, researchData)).toBe(false);
  });
});
