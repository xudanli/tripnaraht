import {
  addUtcDaysToYmd,
  resolveRelativeDayYmdFromAnchor,
  resolveTripTemporalAnchor,
  tripDayNumberFromStart,
} from './trip-temporal-anchor.util';

describe('trip-temporal-anchor.util', () => {
  const range = { startDateYmd: '2026-06-01', endDateYmd: '2026-06-07' };

  it('PRE_TRIP：锚定在 startDate', () => {
    const a = resolveTripTemporalAnchor({
      ...range,
      now: new Date('2026-05-28T12:00:00.000Z'),
    });
    expect(a).toMatchObject({
      phase: 'PRE_TRIP',
      anchorYmd: '2026-06-01',
      todayYmd: '2026-05-28',
      currentDayNumber: 1,
      anchorSource: 'trip_start',
    });
    expect(resolveRelativeDayYmdFromAnchor(a!.anchorYmd, 1)).toBe('2026-06-02');
  });

  it('ON_TRIP：锚定在墙钟 today（未点开始亦同）', () => {
    const a = resolveTripTemporalAnchor({
      ...range,
      now: new Date('2026-06-05T12:00:00.000Z'),
    });
    expect(a).toMatchObject({
      phase: 'ON_TRIP',
      anchorYmd: '2026-06-05',
      todayYmd: '2026-06-05',
      currentDayNumber: 5,
      anchorSource: 'wall_clock',
    });
    expect(resolveRelativeDayYmdFromAnchor(a!.anchorYmd, 1)).toBe('2026-06-06');
  });

  it('POST_TRIP：锚定在 endDate', () => {
    const a = resolveTripTemporalAnchor({
      ...range,
      now: new Date('2026-06-10T12:00:00.000Z'),
    });
    expect(a).toMatchObject({
      phase: 'POST_TRIP',
      anchorYmd: '2026-06-07',
      currentDayNumber: 7,
      anchorSource: 'trip_end',
    });
  });

  it('tripDayNumberFromStart', () => {
    expect(tripDayNumberFromStart('2026-06-01', '2026-06-05')).toBe(5);
    expect(addUtcDaysToYmd('2026-06-05', 1)).toBe('2026-06-06');
  });
});
