import {
  applyExistingItemDurationToUpdateSpec,
  buildItineraryItemUpdateAnswerText,
  detectItineraryItemUpdateIntent,
  parseItineraryItemUpdateSpec,
  parseTimeRangeFromUpdateMessage,
  resolveItemForUpdateWithFallback,
  buildIsoTimesForUpdate,
} from './itinerary-item-update.util';

describe('itinerary-item-update.util', () => {
  it('detects modify-time intent for jokulsarlon example', () => {
    expect(
      detectItineraryItemUpdateIntent('修改冰河湖的行程时间点为10点开始到11点40'),
    ).toBe(true);
  });

  it('does not treat delete/add as update', () => {
    expect(detectItineraryItemUpdateIntent('删除第3天的斯科加瀑布poi')).toBe(false);
    expect(detectItineraryItemUpdateIntent('第3天，新增斯卡夫塔山国家公园poi')).toBe(false);
  });

  it('parses 10点开始到11点40', () => {
    expect(parseTimeRangeFromUpdateMessage('为10点开始到11点40')).toEqual(
      expect.objectContaining({
        startHour: 10,
        startMinute: 0,
        endHour: 11,
        endMinute: 40,
        localLabel: '10:00–11:40',
      }),
    );
  });

  it('parses full update spec', () => {
    const spec = parseItineraryItemUpdateSpec('修改冰河湖的行程时间点为10点开始到11点40');
    expect(spec).toEqual(
      expect.objectContaining({
        poiQuery: '冰河湖',
        startHour: 10,
        startMinute: 0,
        endHour: 11,
        endMinute: 40,
      }),
    );
  });

  it('parses day-scoped update', () => {
    const spec = parseItineraryItemUpdateSpec('调整第4天冰河湖时间到10:00-11:40');
    expect(spec).toEqual(
      expect.objectContaining({
        dayNumber: 4,
        poiQuery: '冰河湖',
      }),
    );
    expect(spec?.startHour).toBe(10);
    expect(spec?.endHour).toBe(11);
    expect(spec?.endMinute).toBe(40);
  });

  it('resolves item by poi name on trip day', () => {
    const resolved = resolveItemForUpdateWithFallback(
      {
        TripDay: [
          {
            id: 'day-4',
            date: '2026-06-04',
            ItineraryItem: [
              {
                id: 'item-jok',
                Place: { id: 1, nameCN: '冰河湖', nameEN: 'Jökulsárlón' },
              },
            ],
          },
        ],
      },
      {
        dayNumber: 4,
        poiQuery: '冰河湖',
        startHour: 10,
        startMinute: 0,
        endHour: 11,
        endMinute: 40,
      },
    );
    expect(resolved.itemId).toBe('item-jok');
    expect(resolved.placeName).toBe('冰河湖');
  });

  it('builds iso times on trip day', () => {
    const iso = buildIsoTimesForUpdate('2026-06-04', {
      poiQuery: '冰河湖',
      startHour: 10,
      startMinute: 0,
      endHour: 11,
      endMinute: 40,
    });
    expect(iso.startTime).toBe('2026-06-04T10:00:00.000Z');
    expect(iso.endTime).toBe('2026-06-04T11:40:00.000Z');
  });

  it('parses gullfoss start-only update', () => {
    const spec = parseItineraryItemUpdateSpec('将黄金瀑布的行程开始时间改为8点30');
    expect(spec).toEqual(
      expect.objectContaining({
        poiQuery: '黄金瀑布',
        startHour: 8,
        startMinute: 30,
        startOnly: true,
      }),
    );
  });

  it('preserves original duration when only start time changes', () => {
    const effective = applyExistingItemDurationToUpdateSpec(
      {
        poiQuery: '黄金瀑布',
        startHour: 8,
        startMinute: 30,
        startOnly: true,
      },
      {
        id: 'item-gull',
        startTime: '2026-06-01T09:00:00.000Z',
        endTime: '2026-06-01T10:00:00.000Z',
      },
    );
    expect(effective.endHour).toBe(9);
    expect(effective.endMinute).toBe(30);
  });

  it('builds success answer text', () => {
    const spec = parseItineraryItemUpdateSpec('修改冰河湖的行程时间点为10点开始到11点40')!;
    expect(
      buildItineraryItemUpdateAnswerText(spec, true, {
        dayNumber: 4,
        placeName: '冰河湖',
        localLabel: '10:00–11:40',
      }),
    ).toContain('第4天');
    expect(
      buildItineraryItemUpdateAnswerText(spec, true, {
        dayNumber: 4,
        placeName: '冰河湖',
        localLabel: '10:00–11:40',
      }),
    ).toContain('10:00–11:40');
  });
});
