import {
  buildLodgingReplaceAnswerText,
  detectLodgingReplaceIntent,
  parseLodgingReplaceSpec,
} from './itinerary-lodging-replace.util';

const USER_MSG =
  '请将我行程中7月22日的住宿从「黄金瀑布酒店」修改为「格伦达菲厄泽宾馆」。同时，将7月23日的出发点更新为格伦达菲厄泽，并按照建议的路线（54号公路→1号公路）重新计算当日驾驶时间。';

describe('itinerary-lodging-replace.util', () => {
  const dateRange = { start_date: '2026-07-22', end_date: '2026-07-29' };

  it('detects lodging replace intent', () => {
    expect(detectLodgingReplaceIntent(USER_MSG)).toBe(true);
    expect(detectLodgingReplaceIntent('冰岛哪里值得游玩')).toBe(false);
  });

  it('parses from/to, check-in, next-day departure and route', () => {
    const spec = parseLodgingReplaceSpec(USER_MSG, dateRange);
    expect(spec).toMatchObject({
      checkInIso: '2026-07-22',
      fromName: '黄金瀑布酒店',
      toName: '格伦达菲厄泽宾馆',
      nextDayDepartureIso: '2026-07-23',
      recalculateDrive: true,
    });
    expect(spec?.routeHintZh).toContain('54');
  });

  it('builds confirmation that mentions hotel swap and drive', () => {
    const spec = parseLodgingReplaceSpec(USER_MSG, dateRange)!;
    const text = buildLodgingReplaceAnswerText(spec, {
      applied: true,
      checkInIso: '2026-07-22',
      replacedFrom: '黄金瀑布酒店',
    });
    expect(text).toContain('格伦达菲厄泽宾馆');
    expect(text).toContain('黄金瀑布酒店');
    expect(text).toContain('2026-07-23');
    expect(text).toMatch(/2\.5|3\.5/);
  });
});
