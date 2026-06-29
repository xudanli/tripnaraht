import {
  analyzeRentalHotelSplit,
  formatHotelDropoffAiSuggestion,
  formatRentalHotelTransport,
} from './split-plan-rental-hotel.util';
import type { SplitPlanScheduleItem } from './split-plan-schedule.source.util';

function item(partial: Partial<SplitPlanScheduleItem> & Pick<SplitPlanScheduleItem, 'id'>): SplitPlanScheduleItem {
  return {
    tripDayId: 'd',
    dayNumber: 1,
    dayIndex: 0,
    type: 'ACTIVITY',
    title: 'x',
    startMs: 0,
    endMs: 1,
    intensity: 'medium',
    riskLevel: 'low',
    ...partial,
  };
}

describe('split-plan-rental-hotel.util', () => {
  it('computes fork→hotel distance and marks dropoff feasible when within threshold', () => {
    const rental = item({
      id: 'rental',
      type: 'TRANSIT',
      title: 'Geysir Car Rental',
      placeName: 'Geysir Car Rental',
      note: '[timelineDisplayRole:car_rental]',
      lat: 64.1466,
      lng: -21.9406,
    });
    const geysir = item({
      id: 'geysir',
      title: '盖歇尔间歇泉',
      placeName: '盖歇尔间歇泉',
      lat: 64.31,
      lng: -20.3,
    });
    const hotel = item({
      id: 'hotel',
      type: 'REST',
      title: '休息',
      placeName: '黑沙滩套房酒店',
      note: '[timelineDisplayRole:hotel]',
      intensity: 'low',
      lat: 63.42,
      lng: -19.01,
    });

    const ctx = analyzeRentalHotelSplit({
      sharedBefore: [rental],
      branchBItems: [hotel],
      allDayItems: [rental, geysir, hotel],
      forkItem: geysir,
    });

    expect(ctx).toBeDefined();
    expect(ctx!.distanceKm).toBeGreaterThan(100);
    expect(ctx!.distanceKm).toBeLessThan(130);
    expect(ctx!.dropoffFeasible).toBe(true);
    expect(formatRentalHotelTransport(ctx!)).toContain('B 组休息');
  });

  it('falls back to itinerary travel minutes from fork to hotel when coords missing', () => {
    const rental = item({
      id: 'rental',
      note: '[timelineDisplayRole:car_rental]',
      intensity: 'low',
    });
    const geysir = item({ id: 'g', travelDurationMin: 98, startMs: 1, endMs: 2 });
    const hotel = item({
      id: 'hotel',
      type: 'REST',
      note: '[timelineDisplayRole:hotel]',
      intensity: 'low',
      travelDurationMin: 64,
      startMs: 3,
      endMs: 4,
    });

    const ctx = analyzeRentalHotelSplit({
      sharedBefore: [rental],
      branchBItems: [hotel],
      allDayItems: [rental, geysir, hotel],
      forkItem: geysir,
    });

    expect(ctx?.driveMin).toBe(64);
    expect(ctx?.source).toBe('itinerary_travel');
  });

  it('formats ai suggestion with shared route before hotel dropoff', () => {
    const text = formatHotelDropoffAiSuggestion({
      sharedRouteLabels: ['凯夫拉维克国际机场', 'Geysir租车公司', '盖歇尔间歇泉', '塞里雅兰瀑布'],
      forkTime: '16:14',
      hotelPlaceName: '黑沙滩套房酒店',
      distanceKm: 53.6,
      driveMin: 62,
      branchAActivities: '钻石沙滩',
      meetupTime: '20:49',
    });
    expect(text).toContain('全员同行');
    expect(text).toContain('16:14');
    expect(text).toContain('钻石沙滩');
    expect(text).toContain('20:49');
    expect(text).not.toContain('租车后先送');
  });
});
