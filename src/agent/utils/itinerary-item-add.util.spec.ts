import {
  buildItineraryItemAddAnswerText,
  detectItineraryItemAddIntent,
  itemAlreadyOnDay,
  parseItineraryItemAddSpec,
  poiKindsConflict,
  resolvePlaceIdForAdd,
  resolveTripDayIdForAdd,
} from './itinerary-item-add.util';

describe('itinerary-item-add.util', () => {
  it('detects add POI on day phrasing', () => {
    expect(detectItineraryItemAddIntent('第3天，新增斯卡夫塔山国家公园poi')).toBe(true);
    expect(detectItineraryItemAddIntent('冰岛 南部 7天自驾')).toBe(false);
  });

  it('parses day number and poi query', () => {
    expect(parseItineraryItemAddSpec('第3天，新增斯卡夫塔山国家公园poi')).toEqual({
      dayNumber: 3,
      poiQuery: '斯卡夫塔山国家公园',
    });
    expect(parseItineraryItemAddSpec('第一天我想新增一个可以购买水果的poi')).toEqual({
      dayNumber: 1,
      poiQuery: '一个可以购买水果的',
    });
  });

  it('resolves trip day id and place from trip history', () => {
    const trip = {
      TripDay: [
        { id: 'd1', date: '2026-06-01', ItineraryItem: [] },
        { id: 'd2', date: '2026-06-02', ItineraryItem: [] },
        {
          id: 'd3',
          date: '2026-06-03',
          ItineraryItem: [
            {
              id: 'other',
              Place: { id: 99, nameCN: '其他' },
            },
          ],
        },
      ],
    };
    const spec = parseItineraryItemAddSpec('第3天，新增斯卡夫塔山国家公园poi')!;
    expect(resolveTripDayIdForAdd(trip, spec.dayNumber)).toEqual({
      tripDayId: 'd3',
      dayNumber: 3,
    });
    expect(
      resolvePlaceIdForAdd(trip, spec, [
        { id: 501, nameCN: '斯卡夫塔山国家公园', nameEN: 'Skaftafell National Park' },
      ]),
    ).toBe(501);
    expect(itemAlreadyOnDay(trip, 3, '斯卡夫塔山国家公园')).toBe(false);
  });

  it('does not treat campground as duplicate of national park on same day', () => {
    const trip = {
      TripDay: [
        { id: 'd1' },
        { id: 'd2' },
        {
          id: 'd3',
          ItineraryItem: [
            {
              id: 'camp-1',
              Place: { id: 88, nameCN: '斯卡夫塔山露营地', nameEN: 'Skaftafell Campground' },
            },
          ],
        },
      ],
    };
    const spec = parseItineraryItemAddSpec('第3天，新增斯卡夫塔山国家公园poi')!;
    expect(itemAlreadyOnDay(trip, 3, spec.poiQuery)).toBe(false);
    expect(poiKindsConflict('斯卡夫塔山国家公园', '斯卡夫塔山露营地')).toBe(true);
  });

  it('builds user-facing answer text', () => {
    const spec = { dayNumber: 3, poiQuery: '斯卡夫塔山国家公园' };
    expect(buildItineraryItemAddAnswerText(spec, 1, { dayNumber: 3 })).toContain('第3天');
    expect(buildItineraryItemAddAnswerText(spec, 0, { alreadyExists: true, dayNumber: 3 })).toContain(
      '已有',
    );
  });

  it('does not treat compound ITINERARY_ADJUST revision as single POI add', () => {
    const msg =
      '请根据顾问建议，调整我的冰岛行程。主要改动：1. 将6月2日的3项活动拆分为2项，把其中一项（如南岸瀑布）移至6月1日或3日。2. 在6月6日或7日增加一个半天的休整活动（如泡温泉）。请帮我生成修改后的行程计划。';
    expect(parseItineraryItemAddSpec(msg)).toBeNull();
  });

  it('parses 增加一个休整活动 sub-clause without swallowing full message', () => {
    expect(
      parseItineraryItemAddSpec('在6月6日或7日增加一个半天的休整活动（如泡温泉）'),
    ).toEqual({
      dayNumber: undefined,
      poiQuery: '一个半天的休整活动（如泡温泉）',
    });
  });
});
