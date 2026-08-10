import {
  extractConsultationDraftDayRows,
  isDiningRecommendationQuery,
  messageHasDiningLocationAnchor,
  tripSummaryIndicatesNonEmptyItineraryDraft,
} from './trip-dining-consultation.util';

describe('trip-dining-consultation.util', () => {
  it('detects dining recommendation', () => {
    expect(isDiningRecommendationQuery('您好，推荐黄金圈附近的餐厅')).toBe(true);
    expect(isDiningRecommendationQuery('推荐一些好吃的地方')).toBe(true);
    expect(isDiningRecommendationQuery('where to eat near Vik')).toBe(true);
    expect(isDiningRecommendationQuery('明天天气')).toBe(false);
  });

  it('detects location anchor including 黄金圈', () => {
    expect(messageHasDiningLocationAnchor('推荐黄金圈附近的餐厅')).toBe(true);
    expect(messageHasDiningLocationAnchor('第一天附近有什么吃的')).toBe(true);
    expect(messageHasDiningLocationAnchor('8.16的，请为我推荐餐厅')).toBe(true);
    expect(messageHasDiningLocationAnchor('8月16号推荐餐厅')).toBe(true);
    expect(messageHasDiningLocationAnchor('推荐餐厅')).toBe(false);
  });

  it('treats UI [日程] DayN suffix as dining anchor', () => {
    expect(
      messageHasDiningLocationAnchor('我想吃汉堡\n\n[日程] Day2 Day 2 · 黄金圈'),
    ).toBe(true);
  });

  it('parses 日程项总数 from consultation summary', () => {
    expect(
      tripSummaryIndicatesNonEmptyItineraryDraft(
        'x\n\n【当前已入库日程草案】\n- 2026-06-01: A → B\n日程项总数: 2\n',
      ),
    ).toBe(true);
    expect(tripSummaryIndicatesNonEmptyItineraryDraft('日程项总数: 0')).toBe(false);
  });

  it('extracts draft day rows after itinerary marker', () => {
    const blob = `base\n【当前已入库日程草案（…）】
- 2026-06-01: A → B
- 2026-06-02: C
日程项总数: 2`;
    expect(extractConsultationDraftDayRows(blob)).toEqual([
      { dayIndex1: 1, dateLabel: '2026-06-01' },
      { dayIndex1: 2, dateLabel: '2026-06-02' },
    ]);
  });
});
