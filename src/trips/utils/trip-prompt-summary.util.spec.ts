import { formatConsultationTripDaySkeletonLines, shouldIncludeNamedDraftAppendixForLightweightConsultation } from './trip-prompt-summary.util';

describe('formatConsultationTripDaySkeletonLines', () => {
  it('aggregates item types per day and appends 日程项总数', () => {
    const s = formatConsultationTripDaySkeletonLines([
      {
        date: new Date('2026-06-02T00:00:00.000Z'),
        ItineraryItem: [{ type: 'POI' }, { type: 'POI' }, { type: 'HOTEL' }],
      },
      {
        date: new Date('2026-06-01T00:00:00.000Z'),
        ItineraryItem: [],
      },
    ]);
    expect(s).toContain('2026-06-01');
    expect(s).toContain('2026-06-02');
    expect(s).toMatch(/HOTEL×1/);
    expect(s).toMatch(/POI×2/);
    expect(s).toContain('日程项总数: 3');
  });
});

describe('shouldIncludeNamedDraftAppendixForLightweightConsultation', () => {
  it('includes named draft when context_type is active_trip_summary (workbench default)', () => {
    expect(
      shouldIncludeNamedDraftAppendixForLightweightConsultation({
        message: '帮我看看',
        contextType: 'active_trip_summary',
      }),
    ).toBe(true);
  });

  it('includes named draft for lodging + dining plan queries', () => {
    const msg = '帮我规划一下这几天的住宿和吃饭方案';
    expect(
      shouldIncludeNamedDraftAppendixForLightweightConsultation({
        message: msg,
        msgLower: msg.toLowerCase(),
      }),
    ).toBe(true);
  });

  it('includes named draft for trip status overview', () => {
    const msg = '帮我全面分析一下当前行程进度';
    expect(
      shouldIncludeNamedDraftAppendixForLightweightConsultation({
        message: msg,
        msgLower: msg.toLowerCase(),
      }),
    ).toBe(true);
  });

  it('does not include named draft for generic unbound-style question without trip context', () => {
    expect(
      shouldIncludeNamedDraftAppendixForLightweightConsultation({
        message: '什么是申根签证',
        msgLower: '什么是申根签证',
      }),
    ).toBe(false);
  });
});
