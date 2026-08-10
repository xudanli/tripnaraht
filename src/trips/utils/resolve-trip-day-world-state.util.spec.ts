import {
  resolveActivityFocusWorldState,
  resolveTripDayWorldState,
} from './resolve-trip-day-world-state.util';

/**
 * GEN1-G2 / GEN1-G4 regression fixture — mirrors trip 5945a3ab… world state:
 * dayThemes[4]=冰川徒步, Day4 items empty, 索尔黑马冰川 on Day3.
 */
const GEN1_TRIP_FIXTURE = {
  startDate: new Date('2026-08-15T00:00:00.000Z'),
  dayThemes: {
    '1': '抵达雷克雅未克',
    '2': '黄金圈',
    '4': '冰川徒步',
  } as Record<string, string>,
  days: [
    {
      date: new Date('2026-08-15T00:00:00.000Z'),
      ItineraryItem: [{ type: 'REST', note: 'Test Hotel', Place: null }],
    },
    {
      date: new Date('2026-08-16T00:00:00.000Z'),
      ItineraryItem: [
        { type: 'ACTIVITY', note: null, Place: { nameCN: '辛格维利尔国家公园', nameEN: null } },
      ],
    },
    {
      date: new Date('2026-08-17T00:00:00.000Z'),
      ItineraryItem: [
        { type: 'ACTIVITY', note: null, Place: { nameCN: '塞里雅兰瀑布', nameEN: null } },
        { type: 'ACTIVITY', note: '[景点探索] 索尔黑马冰川', Place: { nameCN: '索尔黑马冰川', nameEN: null } },
      ],
    },
    {
      date: new Date('2026-08-18T00:00:00.000Z'),
      ItineraryItem: [],
    },
    {
      date: new Date('2026-08-19T00:00:00.000Z'),
      ItineraryItem: [
        { type: 'ACTIVITY', note: null, Place: { nameCN: '斯卡夫塔山国家公园', nameEN: null } },
        { type: 'ACTIVITY', note: null, Place: { nameCN: '冰河湖', nameEN: null } },
      ],
    },
  ],
};

describe('resolveTripDayWorldState (GEN1-G4-A)', () => {
  it('G2 path (日程主题锚) 与 G4 path (Day4 正文) 解析出同一 World State', () => {
    const fromG2 = resolveTripDayWorldState({
      requestedDay: 4,
      startDate: GEN1_TRIP_FIXTURE.startDate,
      days: GEN1_TRIP_FIXTURE.days,
      dayThemes: GEN1_TRIP_FIXTURE.dayThemes,
      activityHint: '冰川徒步', // from [日程] Day4 · 冰川徒步
    });
    const fromG4 = resolveTripDayWorldState({
      requestedDay: 4,
      startDate: GEN1_TRIP_FIXTURE.startDate,
      days: GEN1_TRIP_FIXTURE.days,
      dayThemes: GEN1_TRIP_FIXTURE.dayThemes,
      activityHint: 'Day 4 冰川徒步还有位置吗',
    });

    for (const r of [fromG2, fromG4]) {
      expect(r.requestedDay).toBe(4);
      expect(r.resolvedDate).toBe('2026-08-18');
      expect(r.dayTheme).toBe('冰川徒步');
      expect(r.itemsOnDay).toEqual([]);
      expect(r.matchedActivityItems.some((m) => m.nameZh.includes('索尔黑马'))).toBe(true);
      expect(r.matchedActivityItems[0]?.dayNumber).toBe(3);
      expect(r.matchedActivityItems[0]?.ymd).toBe('2026-08-17');
      expect(r.conflict).toBe('activity_on_other_day');
      expect(r.promptBlockZh).toContain('requestedDay=Day4');
      expect(r.promptBlockZh).toContain('resolvedDate=2026-08-18');
      expect(r.promptBlockZh).toContain('dayTheme=冰川徒步');
      expect(r.promptBlockZh).toContain('Day3(2026-08-17)');
      expect(r.promptBlockZh).toContain('禁止无依据改指其他空日或相邻观光日');
      expect(r.promptBlockZh).toContain('不得仅因 items 为空就断言');
    }

    expect(fromG2.resolvedDate).toBe(fromG4.resolvedDate);
    expect(fromG2.dayTheme).toBe(fromG4.dayTheme);
    expect(fromG2.conflict).toBe(fromG4.conflict);
    expect(fromG2.matchedActivityItems.map((m) => m.nameZh)).toEqual(
      fromG4.matchedActivityItems.map((m) => m.nameZh),
    );
  });

  it('不得把 Day4 冰川主题误绑到 Day5 观光日作为主匹配', () => {
    const r = resolveTripDayWorldState({
      requestedDay: 4,
      startDate: GEN1_TRIP_FIXTURE.startDate,
      days: GEN1_TRIP_FIXTURE.days,
      dayThemes: GEN1_TRIP_FIXTURE.dayThemes,
      activityHint: '冰川徒步',
    });
    const primary = r.matchedActivityItems.find((m) => /冰川/.test(m.nameZh));
    expect(primary?.dayNumber).toBe(3);
    expect(primary?.ymd).not.toBe('2026-08-19');
  });

  it('无 Day 焦点时 resolveActivityFocusWorldState 列出主题日+Day3 匹配，不含 Day5 主题', () => {
    const r = resolveActivityFocusWorldState({
      startDate: GEN1_TRIP_FIXTURE.startDate,
      days: GEN1_TRIP_FIXTURE.days,
      dayThemes: GEN1_TRIP_FIXTURE.dayThemes,
      activityHint: '我们4个人能订冰川徒步吗',
    });
    expect(r).not.toBeNull();
    expect(r!.themeDays.some((t) => t.dayNumber === 4 && t.theme === '冰川徒步')).toBe(true);
    expect(r!.matchedActivityItems.some((m) => m.dayNumber === 3)).toBe(true);
    expect(r!.matchedActivityItems.every((m) => !/冰河湖/.test(m.nameZh))).toBe(true);
    expect(r!.promptBlockZh).toContain('【活动焦点 World State】');
    expect(r!.promptBlockZh).toContain('Day3(2026-08-17)');
    expect(r!.promptBlockZh).toContain('禁止点名未列入本块的其他 Day');
    expect(r!.themeDays.every((t) => t.dayNumber !== 5)).toBe(true);
  });

  it('「这个要提前订吗」无活动强信号 → 不注入活动焦点', () => {
    const r = resolveActivityFocusWorldState({
      startDate: GEN1_TRIP_FIXTURE.startDate,
      days: GEN1_TRIP_FIXTURE.days,
      dayThemes: GEN1_TRIP_FIXTURE.dayThemes,
      activityHint: '这个要提前订吗？',
    });
    expect(r).toBeNull();
  });
});
