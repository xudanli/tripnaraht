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
  resolveSparseSelectedPoiContinuation,
  shouldPreferTripDestinationOnHydration,
  shouldSkipPoiDestinationClarificationForItineraryAdjust,
  shouldSkipPoiDestinationCommuteClarification,
} from './itinerary-adjust-intent.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  CONSULTANT_FULL_TRIP_REPLAN_DAILY_ONLY_MSG,
  CONSULTANT_FULL_TRIP_REPLAN_MSG,
  FULL_TRIP_REPLAN_WITH_HOTEL_MSG,
  TRIP_RANGE_6D_ICELAND,
  WEATHER_FULL_TRIP_REPLAN_MSG,
} from './route-and-run-intent.fixtures';

const WEATHER_ADJUST_MSG = WEATHER_FULL_TRIP_REPLAN_MSG;

const FULL_TRIP_REPLAN_MSG = FULL_TRIP_REPLAN_WITH_HOTEL_MSG;

const TRIP_RANGE = TRIP_RANGE_6D_ICELAND;

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

  it('detects consultant-style full replan with day-6 return constraint (not single-day adjust)', () => {
    expect(detectFullTripReplanIntent(CONSULTANT_FULL_TRIP_REPLAN_MSG, TRIP_RANGE)).toBe(true);
    expect(detectItineraryAdjustIntent(CONSULTANT_FULL_TRIP_REPLAN_MSG, TRIP_RANGE)).toBe(false);
    expect(detectExplicitSingleDayAdjustAnchor(CONSULTANT_FULL_TRIP_REPLAN_MSG, TRIP_RANGE)).toBe(
      false,
    );
  });

  it('detects consultant-style full replan when only 每日 (not 每天) marks per-day constraints', () => {
    expect(detectFullTripReplanIntent(CONSULTANT_FULL_TRIP_REPLAN_DAILY_ONLY_MSG, TRIP_RANGE)).toBe(
      true,
    );
    expect(
      detectExplicitSingleDayAdjustAnchor(CONSULTANT_FULL_TRIP_REPLAN_DAILY_ONLY_MSG, TRIP_RANGE),
    ).toBe(false);
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

  it('detects motion-sickness driven route adjust (not full replan)', () => {
    const msg = '成员说晕车，调整一下路线';
    expect(detectItineraryAdjustIntent(msg)).toBe(true);
    expect(detectFullTripReplanIntent(msg, TRIP_RANGE)).toBe(false);
  });

  it('detects motion-sickness adjust with UI [日程] Day1 suffix', () => {
    const msg = '成员说晕车，调整一下路线\n\n[日程] Day1 Day 1 · 黄金圈';
    expect(detectItineraryAdjustIntent(msg)).toBe(true);
    expect(detectFullTripReplanIntent(msg, TRIP_RANGE)).toBe(false);
  });

  it('does not treat 第N天 as multi-day full replan span', () => {
    const msg = '第2天有人晕车，调整一下路线';
    expect(detectFullTripReplanIntent(msg, TRIP_RANGE)).toBe(false);
    expect(detectItineraryAdjustIntent(msg, TRIP_RANGE)).toBe(true);
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

  it('detects route/coordinate fix + day split request (顾问建议修正第1天)', () => {
    const msg =
      '请根据顾问建议，立即修正行程第1天（11月1日）的路线错误。当前从辛格维利尔国家公园到塞里雅兰瀑布的距离为1555公里，不可执行。请检查并修正这两个景点的地理坐标，并将该段行程拆分为两天';
    expect(
      detectItineraryAdjustIntent(msg, {
        start_date: '2026-11-01',
        end_date: '2026-11-06',
      }),
    ).toBe(true);
    expect(
      extractItineraryAdjustTargetDateFromMessage(msg, {
        start_date: '2026-11-01',
        end_date: '2026-11-06',
      }),
    ).toBe('2026-11-01');
  });

  it('prefers trip destination over coarse NL country', () => {
    expect(isCoarseCountryOnlyDestination('冰岛')).toBe(true);
    expect(shouldPreferTripDestinationOnHydration('冰岛', '冰岛 南部')).toBe(true);
    expect(shouldPreferTripDestinationOnHydration('雷克雅未克', '冰岛 南部')).toBe(false);
  });

  it('prefers trip destination when NL city conflicts with bound-trip country', () => {
    expect(shouldPreferTripDestinationOnHydration('杭州', '冰岛')).toBe(true);
    expect(shouldPreferTripDestinationOnHydration('杭州', 'IS')).toBe(true);
    expect(shouldPreferTripDestinationOnHydration('上海', '日本')).toBe(true);
    // 同国城市：不因冲突规则强制覆盖（仍走 coarse / 长度规则）
    expect(shouldPreferTripDestinationOnHydration('杭州', '上海')).toBe(false);
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
      shouldSkipPoiDestinationClarificationForItineraryAdjust('TRIP_CONSULTATION', 13),
    ).toBe(true);
    expect(
      shouldSkipPoiDestinationClarificationForItineraryAdjust('GENERAL_PLAN', 1),
    ).toBe(false);
  });

  it('backfills sparse cluster from ranked pool instead of clarifying', () => {
    const ranked = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const out = resolveSparseSelectedPoiContinuation({
      scored: [{ id: 1 }],
      rankedPois: ranked,
      minPoiRequired: 2,
      tripPoiSeedCount: 0,
      hasBoundTrip: false,
    });
    expect(out.shouldClarify).toBe(false);
    expect(out.bypassReason).toBe('RANKED_POOL_BACKFILL');
    expect(out.scored).toHaveLength(2);
  });

  it('soft-continues sparse selection on bound trip without enough seeds', () => {
    const out = resolveSparseSelectedPoiContinuation({
      scored: [{ id: 1 }],
      rankedPois: [{ id: 1 }],
      minPoiRequired: 2,
      tripPoiSeedCount: 0,
      hasBoundTrip: true,
    });
    expect(out.shouldClarify).toBe(false);
    expect(out.bypassReason).toBe('BOUND_TRIP_SOFT_CONTINUE');
  });

  it('still clarifies when greenfield ranked pool is truly sparse', () => {
    const out = resolveSparseSelectedPoiContinuation({
      scored: [{ id: 1 }],
      rankedPois: [{ id: 1 }],
      minPoiRequired: 2,
      tripPoiSeedCount: 0,
      hasBoundTrip: false,
    });
    expect(out.shouldClarify).toBe(true);
  });

  it('skips commute clarify on bound trips', () => {
    expect(
      shouldSkipPoiDestinationCommuteClarification({
        tripPoiSeedCount: 0,
        hasBoundTrip: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipPoiDestinationCommuteClarification({
        tripPoiSeedCount: 0,
        hasBoundTrip: false,
      }),
    ).toBe(false);
  });

  it('appends ITINERARY_ADJUST system hints', () => {
    const trip = { message: 'user msg' } as TripPlanRequest;
    appendItineraryAdjustSystemHints(trip, WEATHER_ADJUST_MSG);
    expect(trip.message).toContain('[ITINERARY_ADJUST]');
    expect(trip.message).toContain('4h');
  });
});

describe('poi slot fill intent', () => {
  it('detects recommend suitable attractions for bound trip', async () => {
    const { detectPoiSlotFillIntent } = await import('./itinerary-adjust-poi-slot-fill.util');
    expect(
      detectPoiSlotFillIntent('根据我的行程，推荐一些适合加入的景点', TRIP_RANGE),
    ).toBe(true);
  });
});
