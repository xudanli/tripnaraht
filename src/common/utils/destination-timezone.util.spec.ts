import {
  DEFAULT_DESTINATION_TIMEZONE,
  resolveTripTimezone,
  timezoneForDestination,
  toDestinationClockHm,
  toDestinationOffsetIso,
  withDestinationDisplayTimes,
} from './destination-timezone.util';

describe('destination-timezone.util', () => {
  it('maps CN to Asia/Shanghai and IS to Reykjavik', () => {
    expect(timezoneForDestination('CN')).toBe('Asia/Shanghai');
    expect(timezoneForDestination('cn')).toBe('Asia/Shanghai');
    expect(timezoneForDestination('IS')).toBe('Atlantic/Reykjavik');
    expect(timezoneForDestination('')).toBe('UTC');
  });

  it('prefers metadata.timezone over destination', () => {
    expect(
      resolveTripTimezone({
        destination: 'CN',
        metadata: { timezone: 'Asia/Urumqi' },
      }),
    ).toBe('Asia/Urumqi');
    expect(resolveTripTimezone({ destination: 'CN', metadata: {} })).toBe('Asia/Shanghai');
    expect(resolveTripTimezone({ destination: null, metadata: null })).toBe('UTC');
    expect(resolveTripTimezone({})).toBe('UTC');
  });

  it('keeps Iceland default constant for display fallbacks', () => {
    expect(DEFAULT_DESTINATION_TIMEZONE).toBe('Atlantic/Reykjavik');
  });

  it('serializes CN morning as +08:00 wall clock, not 01:00Z substring', () => {
    const instant = new Date('2026-08-22T01:00:00.000Z');
    expect(toDestinationClockHm(instant, 'Asia/Shanghai')).toBe('09:00');
    expect(toDestinationOffsetIso(instant, 'Asia/Shanghai')).toBe(
      '2026-08-22T09:00:00.000+08:00',
    );
    const enriched = withDestinationDisplayTimes(
      { id: 'x', startTime: instant, endTime: new Date('2026-08-22T02:00:00.000Z') },
      'Asia/Shanghai',
    );
    expect(enriched.startTime).toBe('2026-08-22T09:00:00.000+08:00');
    expect(enriched.startTimeLocal).toBe('09:00');
    expect(enriched.endTimeLocal).toBe('10:00');
    expect(enriched.timezone).toBe('Asia/Shanghai');
  });
});
