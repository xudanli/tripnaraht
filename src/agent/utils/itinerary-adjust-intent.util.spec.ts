import {
  appendItineraryAdjustSystemHints,
  buildDestinationScopeClarificationOptions,
  detectExplicitSingleDayAdjustAnchor,
  detectFullTripReplanIntent,
  detectFullTripReplanHotelIntent,
  detectItineraryAdjustIntent,
  extractMaxDailyDrivingHoursFromMessage,
  extractItineraryAdjustTargetDateFromMessage,
  isCoarseCountryOnlyDestination,
  shouldPreferTripDestinationOnHydration,
  shouldSkipPoiDestinationClarificationForItineraryAdjust,
} from './itinerary-adjust-intent.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

const WEATHER_ADJUST_MSG =
  '根据你刚才分析的天气风险，请为我调整2026年6月1日至7日的冰岛行程，如果某天预报有强风，请优先安排室内活动或替换到风小的景点，并确保每日车程不超过4小时。';

const FULL_TRIP_REPLAN_MSG =
  '请基于当前已确认POI，帮我出一份更合理的6天草案（2026-11-01到11-06），' +
  '包含雷克雅未克和Vik住宿安排、每日适合自驾途中解决的午餐计划。' +
  '假设使用4WD租车从雷克雅未克出发，按逆时针方向组织。请输出待确认行程草案。';

const TRIP_RANGE = { start_date: '2026-11-01', end_date: '2026-11-06' };

describe('itinerary-adjust-intent.util', () => {
  it('detects weather-driven full trip replan (not single-day adjust)', () => {
    expect(detectFullTripReplanIntent(WEATHER_ADJUST_MSG, {
      start_date: '2026-06-01',
      end_date: '2026-06-07',
    })).toBe(true);
    expect(detectItineraryAdjustIntent(WEATHER_ADJUST_MSG, {
      start_date: '2026-06-01',
      end_date: '2026-06-07',
    })).toBe(false);
    expect(detectItineraryAdjustIntent('冰岛 南部 7天自驾')).toBe(false);
  });

  it('detects 6-day bound trip replan with accommodation and daily lunch', () => {
    expect(detectFullTripReplanIntent(FULL_TRIP_REPLAN_MSG, TRIP_RANGE)).toBe(true);
    expect(detectItineraryAdjustIntent(FULL_TRIP_REPLAN_MSG, TRIP_RANGE)).toBe(false);
    expect(detectExplicitSingleDayAdjustAnchor(FULL_TRIP_REPLAN_MSG, TRIP_RANGE)).toBe(false);
  });

  it('detects gap-fill full trip replan for missing accommodation on bound trip', () => {
    const msg =
      '我现在的行程还缺住宿和餐饮安排，请帮我安排雷克雅未克和Vik过夜，并给出每晚住宿建议';
    expect(
      detectFullTripReplanIntent(msg, {
        start_date: '2026-11-01',
        end_date: '2026-11-06',
      }),
    ).toBe(true);
    expect(detectFullTripReplanHotelIntent(msg)).toBe(true);
  });

  it('detects delete POI on bound trip day as itinerary adjust', () => {
    expect(detectItineraryAdjustIntent('删除第3天的斯科加瀑布poi')).toBe(true);
  });

  it('detects add POI on bound trip day as itinerary adjust', () => {
    expect(detectItineraryAdjustIntent('第3天，新增斯卡夫塔山国家公园poi')).toBe(true);
  });

  it('detects 重新规划 on bound trip as itinerary adjust', () => {
    expect(
      detectItineraryAdjustIntent('重新规划一下第二天的行程，现在明显不合理'),
    ).toBe(true);
  });

  it('detects pacing-driven adjust (明天太累了，轻松一点)', () => {
    expect(detectItineraryAdjustIntent('明天太累了，轻松一点')).toBe(true);
  });

  it('PRE_TRIP：明天相对 startDate（出发前规划期）', () => {
    expect(
      extractItineraryAdjustTargetDateFromMessage('明天太累了，轻松一点', {
        start_date: '2026-06-01',
        end_date: '2026-06-07',
        now: new Date('2026-05-28T12:00:00.000Z'),
      }),
    ).toBe('2026-06-02');
  });

  it('ON_TRIP：明天相对墙钟 today（行程窗口内，未点开始亦同）', () => {
    expect(
      extractItineraryAdjustTargetDateFromMessage('明天太累了，轻松一点', {
        start_date: '2026-06-01',
        end_date: '2026-06-07',
        now: new Date('2026-06-05T12:00:00.000Z'),
      }),
    ).toBe('2026-06-06');
  });

  it('detects single-day replan with month-day date and 更新为', () => {
    const msg =
      '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。晚餐推荐为Bæjarins Beztu热狗摊或Messinn餐厅。请生成新的行程草案。';
    expect(detectItineraryAdjustIntent(msg)).toBe(true);
  });

  it('extracts target date from month-day anchor against trip range', () => {
    const msg =
      '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。';
    expect(
      extractItineraryAdjustTargetDateFromMessage(msg, {
        start_date: '2026-06-01',
        end_date: '2026-06-02',
      }),
    ).toBe('2026-06-02');
  });

  it('extracts target date from 第N天 against 7-day Iceland trip (day-2 replan regression)', () => {
    expect(
      extractItineraryAdjustTargetDateFromMessage('重新规划一下第二天的行程，现在明显不合理', {
        start_date: '2026-06-01',
        end_date: '2026-06-07',
      }),
    ).toBe('2026-06-02');
  });

  it('extracts max daily driving hours', () => {
    expect(extractMaxDailyDrivingHoursFromMessage(WEATHER_ADJUST_MSG)).toBe(4);
  });

  it('prefers trip destination over coarse NL country', () => {
    expect(isCoarseCountryOnlyDestination('冰岛')).toBe(true);
    expect(shouldPreferTripDestinationOnHydration('冰岛', '冰岛 南部')).toBe(true);
    expect(shouldPreferTripDestinationOnHydration('雷克雅未克', '冰岛 南部')).toBe(false);
  });

  it('avoids duplicate 南部 in clarification options', () => {
    expect(buildDestinationScopeClarificationOptions('冰岛 南部')).toEqual([
      '冰岛 南部 市区',
      '冰岛 南部 近郊',
      '我来手动输入具体城市/区域',
    ]);
  });

  it('skips POI destination clarify when bound trip has enough POI seeds', () => {
    expect(
      shouldSkipPoiDestinationClarificationForItineraryAdjust('ITINERARY_ADJUST', 13),
    ).toBe(true);
    expect(
      shouldSkipPoiDestinationClarificationForItineraryAdjust('GENERAL_PLAN', 13),
    ).toBe(true);
    expect(
      shouldSkipPoiDestinationClarificationForItineraryAdjust('GENERAL_PLAN', 1),
    ).toBe(false);
  });

  it('appends ITINERARY_ADJUST system hints', () => {
    const trip = { message: 'user msg' } as TripPlanRequest;
    appendItineraryAdjustSystemHints(trip, WEATHER_ADJUST_MSG);
    expect(trip.message).toContain('[ITINERARY_ADJUST]');
    expect(trip.message).toContain('4h');
  });
});
