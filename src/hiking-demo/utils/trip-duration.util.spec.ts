import {
  compareTripAndRouteDays,
  computeTripPlannedDays,
} from './trip-duration.util';

describe('trip-duration.util', () => {
  it('computeTripPlannedDays prefers TripDay count', () => {
    expect(
      computeTripPlannedDays({
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        TripDay: [{}, {}, {}, {}, {}, {}, {}],
      }),
    ).toBe(7);
  });

  it('computeTripPlannedDays falls back to date range', () => {
    expect(
      computeTripPlannedDays({
        startDate: '2026-07-01',
        endDate: '2026-07-04',
        TripDay: [],
      }),
    ).toBe(4);
  });

  it('compareTripAndRouteDays detects trip_longer', () => {
    expect(compareTripAndRouteDays(7, 4)).toEqual({
      daysDelta: 3,
      daysAlignment: 'trip_longer',
    });
  });

  it('compareTripAndRouteDays returns unknown when route missing', () => {
    expect(compareTripAndRouteDays(7, undefined)).toEqual({
      daysAlignment: 'unknown',
    });
  });
});
