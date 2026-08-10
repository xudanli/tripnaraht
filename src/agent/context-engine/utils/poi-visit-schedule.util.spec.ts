import {
  parseVisitDurationLabel,
  resolveCategoryVisitMinutes,
  resolvePoiVisitDurationMinutes,
  resolvePoiVisitWindow,
  clipVisitEnd,
  buildOpeningHoursByPoiId,
} from './poi-visit-schedule.util';

describe('poi-visit-schedule.util', () => {
  it('parseVisitDurationLabel handles Chinese / English ranges', () => {
    expect(parseVisitDurationLabel('半天')).toBe(240);
    expect(parseVisitDurationLabel('约1.5小时')).toBe(90);
    expect(parseVisitDurationLabel('1-2小时')).toBe(90);
    expect(parseVisitDurationLabel('90分钟')).toBe(90);
  });

  it('resolvePoiVisitDurationMinutes prefers explicit fields then category', () => {
    expect(
      resolvePoiVisitDurationMinutes({ duration_minutes: 45, name: '瀑布' }),
    ).toEqual({ minutes: 45, source: 'poi_field' });
    expect(resolvePoiVisitDurationMinutes({ name: 'Skógafoss waterfall' }).source).toBe(
      'category',
    );
    expect(resolvePoiVisitDurationMinutes({ name: 'Skógafoss waterfall' }).minutes).toBe(60);
    expect(resolvePoiVisitDurationMinutes({ name: '无名点' })).toEqual({
      minutes: 90,
      source: 'default',
    });
  });

  it('resolveCategoryVisitMinutes covers hot spring / museum', () => {
    expect(resolveCategoryVisitMinutes({ category: 'hot_spring' })).toBe(150);
    expect(resolveCategoryVisitMinutes({ nameCN: '国家博物馆' })).toBe(120);
  });

  it('resolvePoiVisitWindow uses opening hours + duration, not fixed 2h step', () => {
    const oh = buildOpeningHoursByPoiId({
      opening_hours_evidence: {
        opening_hours: [{ poi_id: 'p1', open_time: '10:00', close_time: '18:00' }],
      },
    });
    const w = resolvePoiVisitWindow({
      poi: { poi_id: 'p1', name: '海角观景台', category: 'viewpoint' },
      slotIndex: 0,
      poiId: 'p1',
      openingHoursByPoi: oh,
      dayCursorMinutes: 9 * 60,
    });
    expect(w.timeSource).toBe('opening_hours_evidence');
    expect(w.startTime).toBe('10:00');
    expect(w.endTime).toBe('10:45');
    expect(w.durationMinutes).toBe(45);
    expect(w.durationSource).toBe('category');
  });

  it('heuristic layout advances by resolved duration', () => {
    const empty = new Map<string, { open: string; close: string }>();
    const first = resolvePoiVisitWindow({
      poi: { name: 'Alpha', duration_minutes: 60 },
      slotIndex: 0,
      poiId: 'a',
      openingHoursByPoi: empty,
      dayCursorMinutes: 9 * 60,
    });
    expect(first.startTime).toBe('09:00');
    expect(first.endTime).toBe('10:00');
    expect(first.durationMinutes).toBe(60);

    const second = resolvePoiVisitWindow({
      poi: { name: 'Beta museum', category: 'museum' },
      slotIndex: 1,
      poiId: 'b',
      openingHoursByPoi: empty,
      dayCursorMinutes: first.nextDayCursorMinutes,
    });
    expect(second.startTime).toBe('10:15');
    expect(second.durationMinutes).toBe(120);
  });

  it('clipVisitEnd respects duration and close', () => {
    expect(clipVisitEnd('09:00', '18:00', 60)).toBe('10:00');
    expect(clipVisitEnd('17:00', '18:00', 120)).toBe('18:00');
  });
});
