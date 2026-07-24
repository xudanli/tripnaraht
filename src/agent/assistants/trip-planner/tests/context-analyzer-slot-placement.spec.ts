import { ContextAnalyzerService } from '../services/context-analyzer.service';
import type { TripContext, TripDayContext } from '../interfaces/trip-planner.interface';

function day(
  dayNumber: number,
  date: string,
  items: TripDayContext['items'],
  extra?: Partial<TripDayContext>,
): TripDayContext {
  const totalDuration = items.reduce((s, i) => s + (i.duration ?? 60), 0);
  return {
    dayId: `day-${dayNumber}`,
    dayNumber,
    date,
    items,
    stats: {
      itemCount: items.length,
      totalDuration,
      totalCost: 0,
      freeTime: Math.max(0, 480 - totalDuration),
      travelTime: 0,
    },
    ...extra,
  };
}

describe('ContextAnalyzerService.analyzeItinerarySlotPlacement', () => {
  const analyzer = new ContextAnalyzerService();

  const icelandTrip: TripContext = {
    tripId: 'trip_is',
    destination: 'IS',
    destinationName: '冰岛',
    startDate: '2026-07-10',
    endDate: '2026-07-14',
    durationDays: 5,
    totalBudget: 0,
    travelers: { adults: 2, children: 0, elderly: 0 },
    pacingConfig: { level: 'STANDARD', maxDailyActivities: 5 },
    status: 'ACTIVE',
    completeness: 60,
    days: [
      day(1, '2026-07-10', [
        { itemId: 'a1', type: 'POI', name: '雷克雅未克市区', startTime: '09:00', endTime: '12:00', duration: 180 },
      ]),
      day(2, '2026-07-11', [
        { itemId: 'a2', type: 'POI', name: '黄金圈', startTime: '09:00', endTime: '17:00', duration: 480 },
      ]),
      day(3, '2026-07-12', [
        {
          itemId: 'a3',
          type: 'POI',
          name: '塞里雅兰瀑布',
          startTime: '10:00',
          endTime: '12:00',
          duration: 120,
        },
        {
          itemId: 'a4',
          type: 'POI',
          name: '米湖',
          startTime: '15:00',
          endTime: '17:00',
          duration: 120,
        },
      ]),
      day(4, '2026-07-13', [
        { itemId: 'a5', type: 'POI', name: '阿克雷里', startTime: '10:00', endTime: '12:00', duration: 120 },
      ]),
      day(5, '2026-07-14', [
        { itemId: 'a6', type: 'POI', name: '返回雷克雅未克', startTime: '09:00', endTime: '18:00', duration: 540 },
      ]),
    ],
  };

  it('matches waterfall day for along-route whale request', () => {
    const result = analyzer.analyzeItinerarySlotPlacement(
      '我想在顺路看瀑布的那天加个观鲸，晚上住阿克雷里',
      icelandTrip,
    );
    expect(result.isPlacementRequested).toBe(true);
    expect(result.suggestedDays.length).toBeGreaterThan(0);
    expect(result.suggestedDays[0].dayNumber).toBe(3);
    expect(result.suggestedDays[0].reasonZh).toMatch(/瀑布|顺路|塞里雅兰/i);
  });

  it('flags schedule tight when geo match but no free-time gap on a packed day', () => {
    const packedDay3 = day(3, '2026-07-12', [
      {
        itemId: 'b1',
        type: 'ACTIVITY',
        name: '冰川徒步',
        startTime: '08:00',
        endTime: '12:00',
        duration: 240,
      },
      {
        itemId: 'b2',
        type: 'POI',
        name: '塞里雅兰瀑布',
        startTime: '13:00',
        endTime: '14:30',
        duration: 90,
      },
      {
        itemId: 'b3',
        type: 'ACTIVITY',
        name: '火山内探险',
        startTime: '15:00',
        endTime: '18:00',
        duration: 180,
      },
      {
        itemId: 'b4',
        type: 'POI',
        name: '斯科加瀑布',
        startTime: '18:30',
        endTime: '19:30',
        duration: 60,
      },
    ]);
    const packedTrip: TripContext = {
      ...icelandTrip,
      days: icelandTrip.days.map((d) => (d.dayNumber === 3 ? packedDay3 : d)),
    };
    const result = analyzer.analyzeItinerarySlotPlacement(
      '顺路看瀑布那天加观鲸',
      packedTrip,
    );
    const d3 = result.suggestedDays.find((s) => s.dayNumber === 3);
    expect(d3).toBeDefined();
    expect(d3?.scheduleTight).toBe(true);
    expect(d3?.tightScheduleNoteZh).toMatch(/紧凑|冰川|瀑布/i);
  });

  it('prefers relaxed second-half days', () => {
    const relaxedTrip: TripContext = {
      ...icelandTrip,
      days: icelandTrip.days.map((d) =>
        d.dayNumber >= 4
          ? { ...d, items: [], stats: { ...d.stats, itemCount: 0, freeTime: 480, totalDuration: 0 } }
          : d,
      ),
    };
    const result = analyzer.analyzeItinerarySlotPlacement(
      '能否在行程后半段比较闲的那天安排观鲸',
      relaxedTrip,
    );
    expect(result.suggestedDays.some((s) => s.dayNumber >= 4)).toBe(true);
    expect(result.suggestedDays[0].reasonZh).toMatch(/后半|闲|空档/i);
  });
});
