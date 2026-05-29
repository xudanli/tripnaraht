import {
  appendItineraryAdjustSystemHints,
  buildDestinationScopeClarificationOptions,
  detectItineraryAdjustIntent,
  extractMaxDailyDrivingHoursFromMessage,
  isCoarseCountryOnlyDestination,
  shouldPreferTripDestinationOnHydration,
  shouldSkipPoiDestinationClarificationForItineraryAdjust,
} from './itinerary-adjust-intent.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

const WEATHER_ADJUST_MSG =
  '根据你刚才分析的天气风险，请为我调整2026年6月1日至7日的冰岛行程，如果某天预报有强风，请优先安排室内活动或替换到风小的景点，并确保每日车程不超过4小时。';

describe('itinerary-adjust-intent.util', () => {
  it('detects weather-driven itinerary adjust', () => {
    expect(detectItineraryAdjustIntent(WEATHER_ADJUST_MSG)).toBe(true);
    expect(detectItineraryAdjustIntent('冰岛 南部 7天自驾')).toBe(false);
  });

  it('detects delete POI on bound trip day as itinerary adjust', () => {
    expect(detectItineraryAdjustIntent('删除第3天的斯科加瀑布poi')).toBe(true);
  });

  it('detects add POI on bound trip day as itinerary adjust', () => {
    expect(detectItineraryAdjustIntent('第3天，新增斯卡夫塔山国家公园poi')).toBe(true);
  });

  it('detects update POI time on bound trip as itinerary adjust', () => {
    expect(detectItineraryAdjustIntent('修改冰河湖的行程时间点为10点开始到11点40')).toBe(true);
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

  it('skips POI destination clarify when adjust has trip seeds', () => {
    expect(
      shouldSkipPoiDestinationClarificationForItineraryAdjust('ITINERARY_ADJUST', 13),
    ).toBe(true);
    expect(
      shouldSkipPoiDestinationClarificationForItineraryAdjust('GENERAL_PLAN', 13),
    ).toBe(false);
  });

  it('appends ITINERARY_ADJUST system hints', () => {
    const trip = { message: 'user msg' } as TripPlanRequest;
    appendItineraryAdjustSystemHints(trip, WEATHER_ADJUST_MSG);
    expect(trip.message).toContain('[ITINERARY_ADJUST]');
    expect(trip.message).toContain('4h');
  });
});
