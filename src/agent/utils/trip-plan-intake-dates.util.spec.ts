import {
  applyBoundTripDateAuthority,
  detectExplicitTripDaysOverride,
  extractTripDurationDaysFromNl,
  parseIntakeNlDatesAndDays,
} from './trip-plan-intake-dates.util';

describe('trip-plan-intake-dates.util', () => {
  it('does not treat 6月5日 as 5-day duration', () => {
    expect(extractTripDurationDaysFromNl('6月5日想利用极昼，24小时不间断自驾环岛')).toBeUndefined();
    const bound = parseIntakeNlDatesAndDays('6月5日想利用极昼，24小时不间断自驾环岛', {
      tripIdBound: true,
      refYear: 2026,
    });
    expect(bound.duration_days).toBeUndefined();
    expect(bound.explicit_days_override).toBeUndefined();
  });

  it('still extracts explicit 5-day duration', () => {
    expect(extractTripDurationDaysFromNl('帮我规划5天冰岛环岛')).toBe(5);
  });

  it('detects 改成7天 override', () => {
    expect(detectExplicitTripDaysOverride('请把行程改成7天')).toBe(7);
  });

  it('trip-bound strips NL dates unless override', () => {
    const parsed = parseIntakeNlDatesAndDays('6月5日想利用极昼', { tripIdBound: true, refYear: 2026 });
    expect(parsed.start_date).toBeUndefined();
    expect(parsed.date_range).toBeUndefined();
    expect(parsed.duration_days).toBeUndefined();
  });

  it('applyBoundTripDateAuthority overwrites mistaken NL 5-day window with trip 7-day', () => {
    const out = applyBoundTripDateAuthority({
      tripStart: '2026-06-01',
      tripEnd: '2026-06-07',
      plan: {
        start_date: '2026-06-01',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-05' },
        days: 5,
      },
      nlParse: parseIntakeNlDatesAndDays('6月5日想利用极昼', { tripIdBound: true }),
      structuredHasDates: false,
    });
    expect(out.authority).toBe('trip_record');
    expect(out.days).toBe(7);
    expect(out.end_date).toBe('2026-06-07');
    expect(out.overwritten_nl_fields).toContain('days');
  });

  it('applyBoundTripDateAuthority honors explicit days override', () => {
    const nl = parseIntakeNlDatesAndDays('请把行程改成5天', { tripIdBound: true });
    const out = applyBoundTripDateAuthority({
      tripStart: '2026-06-01',
      tripEnd: '2026-06-07',
      plan: { start_date: '2026-06-01', days: 5 },
      nlParse: nl,
      structuredHasDates: false,
    });
    expect(out.authority).toBe('nl_override');
    expect(out.days).toBe(5);
    expect(out.end_date).toBe('2026-06-05');
  });
});
