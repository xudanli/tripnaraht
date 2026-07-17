import {
  isPlaceAlreadyOnDay,
  normalizeAttractionTitle,
  titlesOverlap,
  dayContextFitScore,
  type DayRecommendationContext,
} from './attraction-explore-day-context.util';

describe('attraction-explore-day-context.util', () => {
  const day: DayRecommendationContext = {
    dayIndex: 2,
    theme: '瀑布与黑沙滩',
    label: '南岸',
    placeIds: new Set([10]),
    titleKeys: new Set([normalizeAttractionTitle('塞里雅兰瀑布')]),
    rawTitles: ['塞里雅兰瀑布', 'Seljalandsfoss'],
    cityNames: ['Vik'],
    anchors: [{ lat: 63.6156, lng: -19.9885 }],
  };

  it('detects already-on-day by placeId and title overlap', () => {
    expect(isPlaceAlreadyOnDay({ id: 10, nameCN: '其它' }, day)).toBe(true);
    expect(isPlaceAlreadyOnDay({ id: 99, nameCN: '塞里雅兰瀑布' }, day)).toBe(true);
    expect(isPlaceAlreadyOnDay({ id: 99, nameEN: 'Seljalandsfoss' }, day)).toBe(true);
    expect(isPlaceAlreadyOnDay({ id: 99, nameCN: '蓝湖' }, day)).toBe(false);
  });

  it('titlesOverlap handles substrings', () => {
    expect(titlesOverlap('塞里雅兰瀑布', '塞里雅兰')).toBe(true);
    expect(titlesOverlap('蓝湖', '黑沙滩')).toBe(false);
  });

  it('dayContextFitScore boosts nearby / theme-matched places', () => {
    const near = dayContextFitScore(
      {
        id: 1,
        nameCN: '斯科加瀑布',
        nameEN: 'Skogafoss',
        description: '南岸瀑布',
        metadata: { lat: 63.5321, lng: -19.5112 },
        rating: 4.5,
      } as never,
      day,
    );
    const far = dayContextFitScore(
      {
        id: 2,
        nameCN: '阿克雷里',
        nameEN: 'Akureyri',
        description: '北岸城市',
        metadata: { lat: 65.68, lng: -18.09 },
        rating: 4,
      } as never,
      day,
    );
    expect(near.score).toBeGreaterThanOrEqual(0.3);
    expect(near.reasons.some((r) => /当日|南岸|瀑布|靠近|邻近/.test(r))).toBe(true);
    expect(far.score).toBeLessThan(near.score);
  });
});
