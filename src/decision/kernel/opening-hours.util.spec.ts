import { arrivalToWeekMinutesUtc, isOpenAt } from './opening-hours.util';

describe('opening-hours.util isOpenAt (Google periods)', () => {
  it('returns open inside a same-day period (UTC)', () => {
    const oh = {
      periods: [{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }],
    };
    /** 2026-04-20 is Monday UTC if we pick a Monday: 2026-04-20 is Sunday? use getUTCDay */
    const mondayUtc = new Date('2026-04-20T12:00:00.000Z');
    expect(mondayUtc.getUTCDay()).toBe(1);
    const r = isOpenAt(oh, mondayUtc);
    expect(r.open).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.evidence).toBe('PERIODS');
  });

  it('returns closed outside period', () => {
    const oh = {
      periods: [{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }],
    };
    const mondayNight = new Date('2026-04-20T20:00:00.000Z');
    const r = isOpenAt(oh, mondayNight);
    expect(r.open).toBe(false);
    expect(r.degraded).toBe(false);
  });

  it('handles overnight period', () => {
    const oh = {
      periods: [{ open: { day: 4, time: '2200' }, close: { day: 5, time: '0200' } }],
    };
    const thuLate = new Date('2026-04-23T23:00:00.000Z');
    expect(thuLate.getUTCDay()).toBe(4);
    expect(isOpenAt(oh, thuLate).open).toBe(true);
    const friEarly = new Date('2026-04-24T01:00:00.000Z');
    expect(friEarly.getUTCDay()).toBe(5);
    expect(isOpenAt(oh, friEarly).open).toBe(true);
  });

  it('degrades when only is_open_now', () => {
    const r = isOpenAt({ is_open_now: false }, new Date());
    expect(r.degraded).toBe(true);
    expect(r.open).toBe(false);
    expect(r.evidence).toBe('IS_OPEN_NOW_ONLY');
  });
});

describe('arrivalToWeekMinutesUtc', () => {
  it('maps Sunday midnight to 0', () => {
    const d = new Date('2026-04-19T00:00:00.000Z');
    expect(d.getUTCDay()).toBe(0);
    expect(arrivalToWeekMinutesUtc(d)).toBe(0);
  });
});
