import { buildDayDateTime, formatDayClockTime } from './arrange-itinerary-day.util';

describe('arrange-itinerary-day.util timezone', () => {
  const day = new Date('2026-08-21T00:00:00.000Z');

  it('builds CN morning in Asia/Shanghai (not UTC wall clock)', () => {
    const start = buildDayDateTime(day, '09:00', 'Asia/Shanghai');
    expect(start.toISOString()).toBe('2026-08-21T01:00:00.000Z');
    expect(formatDayClockTime(start, 'Asia/Shanghai')).toBe('09:00');
    // 错误地按 UTC 展示会变成 01:00 —— 这是本次修复要避免的
    expect(formatDayClockTime(start, 'utc')).toBe('01:00');
  });

  it('keeps Iceland/UTC wall clock semantics by default', () => {
    const start = buildDayDateTime(day, '09:00');
    expect(start.toISOString()).toBe('2026-08-21T09:00:00.000Z');
    expect(formatDayClockTime(start)).toBe('09:00');
  });
});
