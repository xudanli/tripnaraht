import {
  buildSparseCatalogRestDayPoiSearchHints,
  resolveResearchPoiBaseQueryHint,
} from './research-poi-retrieval-geography-hint.util';

describe('resolveResearchPoiBaseQueryHint', () => {
  it('replaces broad Iceland trip dest with corridor hint when user only names KEF + Akureyri', () => {
    const q = resolveResearchPoiBaseQueryHint({
      tripDestination: '冰岛',
      userMessage: '凯夫拉维克进、阿克雷里出，帮我重排路线，尽量不走回头路。',
    });
    expect(q).toBeDefined();
    expect(q).toContain('凯夫拉维克');
    expect(q).toContain('阿克雷里');
    expect(q).toContain('Iceland');
    expect(q).not.toMatch(/^冰岛\b/);
  });

  it('uses Reykjavik + Akureyri when user names capital region instead of KEF', () => {
    const q = resolveResearchPoiBaseQueryHint({
      tripDestination: '冰岛',
      userMessage: '雷克雅未克进，阿克雷里出，7天',
    });
    expect(q).toContain('雷克雅未克');
    expect(q).toContain('阿克雷里');
  });

  it('does not override when user explicitly says Iceland', () => {
    expect(
      resolveResearchPoiBaseQueryHint({
        tripDestination: '冰岛',
        userMessage: '冰岛凯夫拉维克进阿克雷里出',
      }),
    ).toBeUndefined();
  });

  it('does not override when trip destination is not whole-country Iceland', () => {
    expect(
      resolveResearchPoiBaseQueryHint({
        tripDestination: '阿克雷里',
        userMessage: '凯夫拉维克进、阿克雷里出',
      }),
    ).toBeUndefined();
  });

  it('does not override when corridor anchors incomplete', () => {
    expect(
      resolveResearchPoiBaseQueryHint({
        tripDestination: '冰岛',
        userMessage: '只在凯夫拉维克附近玩两天',
      }),
    ).toBeUndefined();
  });
});

describe('buildSparseCatalogRestDayPoiSearchHints', () => {
  it('returns phased Iceland corridor queries for sparse REST days', () => {
    const base = {
      tripDestination: '冰岛',
      userMessage: '凯夫拉维克进、阿克雷里出',
      totalDays: 7,
    };
    const early = buildSparseCatalogRestDayPoiSearchHints({ ...base, dayNumber1Based: 2 });
    expect(early.some((s) => /South Iceland|南岸/i.test(s))).toBe(true);
    const late = buildSparseCatalogRestDayPoiSearchHints({ ...base, dayNumber1Based: 7 });
    expect(late.some((s) => /North Iceland|北部|Akureyri/i.test(s))).toBe(true);
  });

  it('falls back to destination + snippet when not Iceland corridor', () => {
    const q = buildSparseCatalogRestDayPoiSearchHints({
      tripDestination: '日本',
      userMessage: '京都奈良各一天',
      dayNumber1Based: 2,
      totalDays: 4,
    });
    expect(q.some((s) => s.includes('日本'))).toBe(true);
    expect(q.some((s) => s.includes('京都'))).toBe(true);
  });
});
