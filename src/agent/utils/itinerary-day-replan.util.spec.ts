import {
  buildGoldenCircleDayReplanAnswerText,
  buildGoldenCircleScheduleSlots,
  collectActivityItemIdsForDayReplan,
  detectGoldenCircleDayReplanIntent,
  parseGoldenCircleDayReplanSpec,
  pickGoldenCirclePlaceFromCandidates,
  resolveGoldenCirclePlaceIdsFromTrip,
  resolveTripDayByDate,
} from './itinerary-day-replan.util';

const GOLDEN_CIRCLE_MSG =
  '请将我的6月2日行程更新为：上午从雷克雅未克出发，游览黄金圈（辛格维利尔国家公园、盖歇尔间歇泉、黄金瀑布），下午返回雷克雅未克。晚餐推荐为Bæjarins Beztu热狗摊或Messinn餐厅。请生成新的行程草案。';

describe('itinerary-day-replan.util', () => {
  it('detects golden circle single-day replan', () => {
    expect(detectGoldenCircleDayReplanIntent(GOLDEN_CIRCLE_MSG)).toBe(true);
    expect(detectGoldenCircleDayReplanIntent('删除第2天的黄金瀑布')).toBe(false);
  });

  it('parses target date from message', () => {
    const spec = parseGoldenCircleDayReplanSpec(GOLDEN_CIRCLE_MSG, {
      start_date: '2026-06-01',
      end_date: '2026-06-02',
    });
    expect(spec?.regionId).toBe('golden_circle');
    expect(spec?.targetDateIso).toBe('2026-06-02');
    expect(spec?.anchorSlugs).toEqual(['thingvellir', 'geysir', 'gullfoss']);
  });

  it('resolves trip day by iso date', () => {
    const trip = {
      TripDay: [
        { id: 'day-1', date: '2026-06-01T00:00:00.000Z', ItineraryItem: [] },
        { id: 'day-2', date: '2026-06-02T00:00:00.000Z', ItineraryItem: [{ id: 'x1', type: 'ACTIVITY' }] },
      ],
    };
    const resolved = resolveTripDayByDate(trip, '2026-06-02');
    expect(resolved.tripDayId).toBe('day-2');
    expect(resolved.dayNumber).toBe(2);
    expect(resolved.items).toHaveLength(1);
  });

  it('returns empty when target date missing on trip', () => {
    const trip = {
      TripDay: [{ id: 'day-1', date: '2026-06-01T00:00:00.000Z', ItineraryItem: [] }],
    };
    expect(resolveTripDayByDate(trip, '2026-06-02').tripDayId).toBeUndefined();
  });

  it('collects activity items for replacement', () => {
    const ids = collectActivityItemIdsForDayReplan([
      { id: 'a1', type: 'ACTIVITY' },
      { id: 'r1', type: 'REST' },
      { id: 'm1', type: 'MEAL_FLOATING' },
    ] as never[]);
    expect(ids).toEqual(['a1', 'm1']);
  });

  it('builds three schedule slots for golden circle', () => {
    const slots = buildGoldenCircleScheduleSlots('2026-06-02T00:00:00.000Z');
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.slug)).toEqual(['thingvellir', 'geysir', 'gullfoss']);
    expect(slots[0].startTime).toMatch(/T\d{2}:\d{2}:\d{2}/);
  });

  it('resolves place ids already on trip', () => {
    const trip = {
      TripDay: [
        {
          id: 'd1',
          ItineraryItem: [
            {
              id: 'i1',
              Place: { id: 381084, nameCN: '黄金瀑布', nameEN: 'Gullfoss' },
            },
          ],
        },
      ],
    };
    expect(resolveGoldenCirclePlaceIdsFromTrip(trip).gullfoss).toBe(381084);
  });

  it('does not pick Geysir car rental as geysir anchor', () => {
    const id = pickGoldenCirclePlaceFromCandidates('geysir', [
      { poi_id: 2002, nameCN: 'Geysir租车公司', nameEN: 'Geysir Car Rental' },
      { poi_id: 42001, nameEN: 'Geysir Geothermal Area', nameCN: '盖歇尔地热区' },
    ]);
    expect(id).toBe(42001);
  });

  it('builds user-facing answer text', () => {
    const text = buildGoldenCircleDayReplanAnswerText({
      targetDateIso: '2026-06-02',
      placeNames: ['辛格维利尔', '盖歇尔', '黄金瀑布'],
      deletedCount: 5,
      addedCount: 3,
    });
    expect(text).toContain('6月2日');
    expect(text).toContain('黄金圈');
    expect(text).toContain('辛格维利尔');
  });
});
