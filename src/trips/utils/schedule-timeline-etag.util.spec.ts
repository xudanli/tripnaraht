import {
  buildScheduleTimelineEtag,
  buildScheduleTimelineQueryFingerprint,
  etagMatches,
  formatEtagHeader,
  normalizeEtagToken,
  parseIfNoneMatch,
} from './schedule-timeline-etag.util';

describe('schedule-timeline-etag.util', () => {
  it('builds stable etag from trip revision and query', () => {
    const fp = buildScheduleTimelineQueryFingerprint({
      include: 'items,schedule',
      from: 0,
      limit: 5,
    });
    const etag = buildScheduleTimelineEtag({
      tripUpdatedAt: new Date('2026-06-20T12:00:00.000Z'),
      queryFingerprint: fp,
      dayCount: 5,
      itemCount: 12,
    });
    expect(etag).toMatch(/^[a-f0-9]{16}$/);
    expect(
      buildScheduleTimelineEtag({
        tripUpdatedAt: new Date('2026-06-20T12:00:00.000Z'),
        queryFingerprint: fp,
        dayCount: 5,
        itemCount: 12,
      }),
    ).toBe(etag);
  });

  it('matches If-None-Match with quoted and weak etags', () => {
    const etag = 'abc123def4567890';
    expect(etagMatches(`"${etag}"`, etag)).toBe(true);
    expect(etagMatches(`W/"${etag}"`, etag)).toBe(true);
    expect(etagMatches('other, "abc123def4567890"', etag)).toBe(true);
    expect(etagMatches('"stale"', etag)).toBe(false);
  });

  it('formats header and parses tokens', () => {
    expect(formatEtagHeader('abc')).toBe('"abc"');
    expect(normalizeEtagToken('W/"abc"')).toBe('abc');
    expect(parseIfNoneMatch('"a", W/"b"')).toEqual(['a', 'b']);
  });
});
