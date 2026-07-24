import {
  formatClockLabel,
  formatClockLabelOptional,
  parseClockHour,
  DEFAULT_TRIP_DISPLAY_TIMEZONE,
} from './format-clock-label.util';

describe('formatClockLabel', () => {
  it('formats ISO timestamps to HH:mm preserving offset when no timezone forced', () => {
    expect(formatClockLabel('2026-07-16T15:44:00.000+00:00')).toBe('15:44');
    expect(formatClockLabel('2026-06-22T07:55:00.000+08:00')).toBe('07:55');
    expect(formatClockLabel('2026-06-22T10:59:00.000Z')).toBe('10:59');
  });

  it('rezones to trip display timezone when requested', () => {
    expect(
      formatClockLabel('2026-07-16T15:44:00.000+08:00', {
        timezone: DEFAULT_TRIP_DISPLAY_TIMEZONE,
      }),
    ).toBe('07:44');
  });

  it('formats Date via utc then optional trip zone', () => {
    const d = new Date('2026-07-16T15:44:00.000Z');
    expect(formatClockLabel(d)).toBe('15:44');
    expect(formatClockLabel(d, { timezone: DEFAULT_TRIP_DISPLAY_TIMEZONE })).toBe('15:44');
  });

  it('passes through plain clock strings', () => {
    expect(formatClockLabel('15:44')).toBe('15:44');
    expect(formatClockLabel('9:05')).toBe('09:05');
  });

  it('falls back for empty values', () => {
    expect(formatClockLabel(undefined)).toBe('待确认');
    expect(formatClockLabel('')).toBe('待确认');
    expect(formatClockLabel(null, { emptyLabel: '--:--' })).toBe('--:--');
  });
});

describe('formatClockLabelOptional / parseClockHour', () => {
  it('returns undefined for empty optional labels', () => {
    expect(formatClockLabelOptional(undefined)).toBeUndefined();
    expect(formatClockLabelOptional('')).toBeUndefined();
  });

  it('parses hour for late-arrival rules without matching ISO date digits', () => {
    expect(parseClockHour('2026-07-16T21:10:00.000Z')).toBe(21);
    expect(parseClockHour('2026-07-16T09:10:00.000Z')).toBe(9);
    expect(parseClockHour('15:44')).toBe(15);
  });
});
