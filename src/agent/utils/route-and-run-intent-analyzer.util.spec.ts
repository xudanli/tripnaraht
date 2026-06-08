import {
  analyzeRouteAndRunIntent,
  detectItinerarySlotPlacementIntent,
  isItinerarySlotPlacementClarificationPending,
  isPeakSeasonFollowUpClarificationPending,
} from './route-and-run-intent-analyzer.util';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

const SLOT_MSG =
  '能否在哪个行程里安排北部的胡萨维克，想观鲸，晚上住阿克雷里，希望避开白天的旅游大巴人潮。';

const DATED_PEAK_MSG =
  '6月25号下午我们到北部的胡萨维克，想安排一场观鲸，晚上住在阿克雷里，希望避开白天的旅游大巴人潮。';

const WEATHER_ADJUST_MSG =
  '根据你刚才分析的天气风险，请为我调整2026年6月1日至7日的冰岛行程，如果某天预报有强风，请优先安排室内活动或替换到风小的景点，并确保每日车程不超过4小时。';

describe('route-and-run-intent-analyzer.util', () => {
  it('detects itinerary slot placement phrasing', () => {
    expect(detectItinerarySlotPlacementIntent(SLOT_MSG)).toBe(true);
    expect(detectItinerarySlotPlacementIntent(DATED_PEAK_MSG)).toBe(false);
  });

  it('prioritizes slot placement over peak SKU when trip is bound', () => {
    const trip = { trip_id: 't1', message: SLOT_MSG } as TripPlanRequest;
    const analysis = analyzeRouteAndRunIntent(SLOT_MSG, { trip, tripId: 't1' });
    expect(analysis.primary).toBe('ITINERARY_SLOT_PLACEMENT');
    expect(analysis.sub_signals.peak_season_crowd_avoidance).toBe(true);
  });

  it('classifies bound trip midnight sun marathon as ITINERARY_ADJUST when days exist', () => {
    const msg = '6月5日想利用极昼，24小时不间断自驾环岛';
    const analysis = analyzeRouteAndRunIntent(msg, {
      tripId: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
      hasTripDays: true,
    });
    expect(analysis.primary).toBe('ITINERARY_ADJUST');
    expect(analysis.sub_signals.marathon_deferred).toBe(true);
  });

  it('classifies bound trip weather adjust as GENERAL_PLAN full-trip replan when days exist', () => {
    const analysis = analyzeRouteAndRunIntent(WEATHER_ADJUST_MSG, {
      tripId: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
      hasTripDays: true,
      trip: {
        trip_id: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
        date_range: { start_date: '2026-06-01', end_date: '2026-06-07' },
      } as TripPlanRequest,
    });
    expect(analysis.primary).toBe('GENERAL_PLAN');
  });

  it('classifies bound trip golden circle day replan as ITINERARY_ADJUST when days exist', () => {
    const msg =
      '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。晚餐推荐为Bæjarins Beztu热狗摊或Messinn餐厅。请生成新的行程草案。';
    const analysis = analyzeRouteAndRunIntent(msg, {
      tripId: 'trip-1',
      hasTripDays: true,
    });
    expect(analysis.primary).toBe('ITINERARY_ADJUST');
  });

  it('classifies bound trip golden circle when tripId present even without day snapshot load', () => {
    const msg =
      '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。';
    const analysis = analyzeRouteAndRunIntent(msg, {
      tripId: 'trip-1',
      hasTripDays: true,
    });
    expect(analysis.primary).toBe('ITINERARY_ADJUST');
  });

  it('classifies adjust intent on bound trip without requiring marathon signal', () => {
    const analysis = analyzeRouteAndRunIntent('删除第3天的斯科加瀑布poi', {
      tripId: 'trip-1',
      hasTripDays: true,
    });
    expect(analysis.primary).toBe('ITINERARY_ADJUST');
  });

  it('classifies bound trip delete POI as ITINERARY_ADJUST when days exist', () => {
    const analysis = analyzeRouteAndRunIntent('删除第3天的斯科加瀑布poi', {
      tripId: 'trip-1',
      hasTripDays: true,
    });
    expect(analysis.primary).toBe('ITINERARY_ADJUST');
  });

  it('classifies bound trip day replan with 重新规划 as ITINERARY_ADJUST when days exist', () => {
    const analysis = analyzeRouteAndRunIntent('重新规划一下第二天的行程，现在明显不合理', {
      tripId: 'b950dbf2-7583-4b43-b0c6-ddd947719c54',
      hasTripDays: true,
    });
    expect(analysis.primary).toBe('ITINERARY_ADJUST');
  });

  it('slot placement clarification pending until answered', () => {
    const analysis = analyzeRouteAndRunIntent(SLOT_MSG, { tripId: 't1' });
    expect(isItinerarySlotPlacementClarificationPending(analysis, [])).toBe(true);
    expect(
      isItinerarySlotPlacementClarificationPending(analysis, [
        { questionId: 'itinerary_slot_placement_v1', value: 'PLACE_ON_D3' },
      ]),
    ).toBe(false);
  });

  it('peak season follow-up after slot day selected', () => {
    const analysis = analyzeRouteAndRunIntent(SLOT_MSG, { tripId: 't1' });
    expect(
      isPeakSeasonFollowUpClarificationPending(analysis, [
        { questionId: 'itinerary_slot_placement_v1', value: 'PLACE_ON_D3' },
      ]),
    ).toBe(true);
    expect(
      isPeakSeasonFollowUpClarificationPending(analysis, [
        { questionId: 'itinerary_slot_placement_v1', value: 'PLACE_ON_D3' },
        { questionId: 'peak_season_midnight_sun_whale_v1', value: 'LOCK_MIDNIGHT_SUN_WHALE_SLOT' },
      ]),
    ).toBe(false);
  });
});
