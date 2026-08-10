import {
  buildDayLodgingChoicePromptLines,
  isDayLodgingChoiceQuery,
  isLodgingReplaceOrSwapQuery,
  isOvernightLodgingItineraryItem,
  parseLodgingChoiceCalendarYmd,
  parseLodgingChoiceDayNumber,
  pickSearchAnchorFromCorridor,
  resolveLodgingChoiceDayNumber,
  shouldSearchHotelCandidatesDespiteExisting,
} from './day-lodging-choice.util';
import { isHotelInventorySearchQuery, shouldForceDataLookupForBoundTripReview } from './orchestration-signals.util';
import { parseExplicitHotelNightScopeIndices } from './hotel-mcp-route-run.mapper';

describe('day-lodging-choice.util', () => {
  it('parses Day2 / 第2天', () => {
    expect(parseLodgingChoiceDayNumber('Day2住宿怎么选？')).toBe(2);
    expect(parseLodgingChoiceDayNumber('day 2 where to stay')).toBe(2);
    expect(parseLodgingChoiceDayNumber('第2天住哪')).toBe(2);
    expect(parseLodgingChoiceDayNumber('D2推荐酒店')).toBe(2);
  });

  it('detects day lodging choice queries', () => {
    expect(isDayLodgingChoiceQuery('Day2住宿怎么选？')).toBe(true);
    expect(isDayLodgingChoiceQuery('第2天住哪里比较好')).toBe(true);
    expect(isDayLodgingChoiceQuery('可以给我推荐吗？8月19号的酒店。')).toBe(true);
    expect(isDayLodgingChoiceQuery('今天天气怎么样')).toBe(false);
    expect(isDayLodgingChoiceQuery('帮我改第2天行程')).toBe(false); // adjust may still be lodging? 改行程 is adjust - day lodging requires lodging+choice; "改" alone without 住 - actually 帮我改第2天行程 has no lodging keyword - false. Good.
  });

  it('maps calendar lodging date to trip day index', () => {
    expect(parseLodgingChoiceCalendarYmd('可以给我推荐吗？8月19号的酒店。', { tripStartYmd: '2026-08-15' })).toBe(
      '2026-08-19',
    );
    expect(resolveLodgingChoiceDayNumber('可以给我推荐吗？8月19号的酒店。', '2026-08-15')).toBe(5);
    expect(resolveLodgingChoiceDayNumber('Day2住哪', '2026-08-15')).toBe(2);
    expect(parseLodgingChoiceCalendarYmd('给我推荐19号的酒店', { tripStartYmd: '2026-08-15' })).toBe(
      '2026-08-19',
    );
    expect(resolveLodgingChoiceDayNumber('给我推荐19号的酒店', '2026-08-15')).toBe(5);
    expect(isDayLodgingChoiceQuery('给我推荐19号的酒店')).toBe(true);
    expect(isHotelInventorySearchQuery('给我推荐19号的酒店')).toBe(true);
    expect(isHotelInventorySearchQuery('推荐酒店')).toBe(true);
    expect(parseLodgingChoiceCalendarYmd('推荐8.19的酒店', { tripStartYmd: '2026-08-15' })).toBe(
      '2026-08-19',
    );
    expect(isDayLodgingChoiceQuery('推荐8.19的酒店')).toBe(true);
  });

  it('forces hotel inventory for calendar hotel recommend', () => {
    const msg = '可以给我推荐吗？8月19号的酒店。';
    expect(isHotelInventorySearchQuery(msg, msg.toLowerCase())).toBe(true);
  });

  it('forces hotel inventory / DATA_LOOKUP for Day2住宿怎么选', () => {
    const msg = 'Day2住宿怎么选？';
    expect(isHotelInventorySearchQuery(msg, msg.toLowerCase())).toBe(true);
    expect(shouldForceDataLookupForBoundTripReview({ trip_id: 't1', message: msg })).toBe(true);
    expect(parseExplicitHotelNightScopeIndices(msg, 6)).toEqual([1]);
  });

  it('forces hotel inventory for Day2 preference hotel swap (near next day / value / sleep-in)', () => {
    const msg =
      '第二天的行程我要换一个离第三天，行程更近一点的酒店，性价比比较高，原因是因为我第二天不想早起，但是呢，我又想起一个性价比比较高的一个住宿体验\n\n[日程] Day2 Day 2 · 黄金圈';
    expect(isDayLodgingChoiceQuery(msg)).toBe(true);
    expect(isHotelInventorySearchQuery(msg)).toBe(true);
    expect(shouldForceDataLookupForBoundTripReview({ trip_id: 't1', message: msg })).toBe(true);
    expect(parseLodgingChoiceDayNumber(msg)).toBe(2);
  });

  it('forces hotel inventory for Day2 room preference follow-up without 酒店 keyword', () => {
    const msg =
      '预算上限控制在3000元人民币，最好是可以看到一些自然景色，厨房没有限制要求，然后是需要标间的\n\n[日程] Day2 Day 2 · 黄金圈';
    expect(isDayLodgingChoiceQuery(msg)).toBe(true);
    expect(isHotelInventorySearchQuery(msg)).toBe(true);
    expect(shouldForceDataLookupForBoundTripReview({ trip_id: 't1', message: msg })).toBe(true);
    expect(resolveLodgingChoiceDayNumber(msg, '2026-08-15')).toBe(2);
  });

  it('forces hotel inventory for 「替换上的酒店选择」+ [日程] Day2 (not REPLACE_ACTIVITY)', () => {
    const msg = '我要有替换上的酒店选择\n\n[日程] Day2 Day 2 · 黄金圈';
    expect(isDayLodgingChoiceQuery(msg)).toBe(true);
    expect(isHotelInventorySearchQuery(msg)).toBe(true);
    expect(shouldForceDataLookupForBoundTripReview({ trip_id: 't1', message: msg })).toBe(true);
    expect(parseLodgingChoiceDayNumber(msg)).toBe(2);
  });

  it('detects explicit replace/swap lodging intent', () => {
    expect(isLodgingReplaceOrSwapQuery('我要替换酒店')).toBe(true);
    expect(isLodgingReplaceOrSwapQuery('我要换酒店\n\n[日程] Day2')).toBe(true);
    expect(isLodgingReplaceOrSwapQuery('Day2住宿怎么选？')).toBe(false);
  });

  it('forces MCP search despite existing overnight for recommend / choose', () => {
    expect(shouldSearchHotelCandidatesDespiteExisting('推荐酒店\n\n[日程] Day1')).toBe(true);
    expect(shouldSearchHotelCandidatesDespiteExisting('Day2住宿怎么选？')).toBe(true);
    expect(shouldSearchHotelCandidatesDespiteExisting('我要替换酒店')).toBe(true);
    expect(shouldSearchHotelCandidatesDespiteExisting('今晚住哪\n\n[日程] Day1')).toBe(false);
  });

  it('replacement prompt mentions candidates, not reuse confirmation', () => {
    const lines = buildDayLodgingChoicePromptLines(
      {
        dayNumber: 2,
        checkInYmd: '2026-06-02',
        checkOutYmd: '2026-06-03',
        nightIndex0: 1,
        endOfDay: null,
        nextDayStart: null,
        searchAnchor: null,
        existingOvernight: { type: 'HOTEL', nameZh: '塞尔福斯宾馆' },
      },
      { seekingReplacement: true },
    );
    expect(lines.join('\n')).toContain('候选');
    expect(lines.join('\n')).toContain('塞尔福斯宾馆');
    expect(lines.join('\n')).not.toContain('沿用还是更换');
  });

  it('detects existing overnight via place category or name', () => {
    expect(isOvernightLodgingItineraryItem({ placeCategory: 'HOTEL', nameZh: 'Foo' })).toBe(true);
    expect(isOvernightLodgingItineraryItem({ type: 'ACTIVITY', nameZh: '蓝湖' })).toBe(false);
    expect(isOvernightLodgingItineraryItem({ type: 'ACTIVITY', nameZh: '维克民宿' })).toBe(true);
  });

  it('picks corridor midpoint when both anchors exist', () => {
    const a = { lat: 64, lng: -20, nameZh: 'A' };
    const b = { lat: 66, lng: -18, nameZh: 'B' };
    const mid = pickSearchAnchorFromCorridor(a, b)!;
    expect(mid.lat).toBe(65);
    expect(mid.lng).toBe(-19);
    expect(mid.nameZh).toContain('走廊');
  });

  it('builds reuse vs search prompt lines', () => {
    const reuse = buildDayLodgingChoicePromptLines({
      dayNumber: 2,
      checkInYmd: '2026-06-02',
      checkOutYmd: '2026-06-03',
      nightIndex0: 1,
      endOfDay: null,
      nextDayStart: null,
      searchAnchor: null,
      existingOvernight: { type: 'HOTEL', nameZh: 'Vik Hotel' },
    });
    expect(reuse.join('\n')).toContain('已有住宿');

    const search = buildDayLodgingChoicePromptLines({
      dayNumber: 2,
      checkInYmd: '2026-06-02',
      checkOutYmd: '2026-06-03',
      nightIndex0: 1,
      endOfDay: { lat: 1, lng: 2, nameZh: '末站' },
      nextDayStart: { lat: 3, lng: 4, nameZh: '次日' },
      searchAnchor: { lat: 2, lng: 3, nameZh: '走廊' },
      existingOvernight: null,
    });
    expect(search.join('\n')).toContain('末站');
    expect(search.join('\n')).toContain('次日');
  });
});
