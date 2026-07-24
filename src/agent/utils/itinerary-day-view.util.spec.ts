import {
  buildItineraryDayViewAnswerText,
  detectItineraryDayViewIntent,
  parseItineraryDayViewSpec,
  resolveTripDayIndexFromViewSpec,
} from './itinerary-day-view.util';

describe('itinerary-day-view.util', () => {
  it('detects view day itinerary intent', () => {
    expect(detectItineraryDayViewIntent('查看第三天的行程')).toBe(true);
    expect(detectItineraryDayViewIntent('查询第2天的行程')).toBe(true);
    expect(detectItineraryDayViewIntent('修改第三天的行程')).toBe(false);
    expect(detectItineraryDayViewIntent('删除第3天的斯科加瀑布')).toBe(false);
  });

  it('parses day number from Chinese numeral', () => {
    expect(parseItineraryDayViewSpec('查看第三天的行程')).toEqual({
      dayNumber: 3,
      targetDateIso: undefined,
    });
  });

  it('resolves day index by day number', () => {
    const days = [{ date: '2026-06-01' }, { date: '2026-06-02' }, { date: '2026-06-03' }];
    expect(resolveTripDayIndexFromViewSpec(days, { dayNumber: 3 })).toBe(2);
  });

  it('builds readable day summary', () => {
    const text = buildItineraryDayViewAnswerText({
      dayNumber: 3,
      dateIso: '2026-06-03',
      items: [
        {
          startTime: '2026-06-03T09:00:00.000Z',
          endTime: '2026-06-03T10:30:00.000Z',
          Place: { nameCN: '辛格维利尔国家公园' },
        },
        {
          startTime: '2026-06-03T09:00:00.000Z',
          crossDayInfo: { isCheckoutItem: true, displayMode: 'checkout' },
          Place: { nameCN: '黑沙滩套房酒店' },
        },
      ],
    });
    expect(text).toContain('第 3 天');
    expect(text).toContain('辛格维利尔');
    expect(text).toContain('【退房】');
  });
});
