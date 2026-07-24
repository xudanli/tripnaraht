import { resolvePatchDateTime } from './activity-patch-time.util';

describe('resolvePatchDateTime', () => {
  const day = new Date('2026-07-08T00:00:00.000Z');

  it('parses HH:mm against TripDay date (UTC)', () => {
    const result = resolvePatchDateTime(day, '10:30');
    expect(result?.toISOString()).toBe('2026-07-08T10:30:00.000Z');
  });

  it('parses ISO8601', () => {
    const result = resolvePatchDateTime(day, '2026-07-08T14:00:00.000Z');
    expect(result?.toISOString()).toBe('2026-07-08T14:00:00.000Z');
  });

  it('returns fallback for empty string', () => {
    const fallback = new Date('2026-07-08T09:00:00.000Z');
    expect(resolvePatchDateTime(day, '  ', fallback)?.toISOString()).toBe(
      fallback.toISOString(),
    );
  });

  it('rejects garbage', () => {
    expect(() => resolvePatchDateTime(day, 'not-a-time')).toThrow(/无效时间/);
  });
});
