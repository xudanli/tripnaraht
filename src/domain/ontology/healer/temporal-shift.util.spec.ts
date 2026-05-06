import { addUtcCalendarDays, computeIcelandFrRoadTemporalShift, utcDateFromMonthDay } from './temporal-shift.util';

describe('temporal-shift.util', () => {
  it('utcDateFromMonthDay builds Jun 20 in reference year', () => {
    const d = utcDateFromMonthDay(2026, '06-20', 12);
    expect(d.getUTCMonth() + 1).toBe(6);
    expect(d.getUTCDate()).toBe(20);
  });

  it('addUtcCalendarDays shifts UTC calendar days', () => {
    const from = new Date('2026-07-15T10:00:00.000Z');
    const out = addUtcCalendarDays(from, 2);
    expect(out.toISOString()).toBe('2026-07-17T10:00:00.000Z');
  });

  it('shifts May F-road enter_at to on/after open + buffer (Plan 1 delta)', () => {
    const current = new Date('2026-05-15T10:00:00.000Z');
    const out = computeIcelandFrRoadTemporalShift({
      current_enter_at: current,
      open_window_inclusive_from: '06-20',
      buffer_days: 2,
    });
    expect(out.suggested_enter_at.getTime()).toBeGreaterThan(current.getTime());
    expect(out.shift_days).toBeGreaterThan(0);
    expect(out.earliest_open_utc.getUTCMonth() + 1).toBe(6);
    expect(out.earliest_open_utc.getUTCDate()).toBe(20);
  });
});
