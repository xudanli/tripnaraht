import {
  buildItineraryItemDeleteAnswerText,
  detectItineraryItemDeleteIntent,
  parseItineraryItemDeleteSpec,
  resolveItemIdsForDeleteFromTrip,
  resolveItemIdsForDeleteWithFallback,
} from './itinerary-item-delete.util';

describe('itinerary-item-delete.util', () => {
  it('detects delete POI on day phrasing', () => {
    expect(detectItineraryItemDeleteIntent('删除第3天的斯科加瀑布poi')).toBe(true);
    expect(detectItineraryItemDeleteIntent('帮我把第二天的酒店删了')).toBe(true);
    expect(detectItineraryItemDeleteIntent('冰岛 南部 7天自驾')).toBe(false);
  });

  it('parses Chinese day and suffix delete phrasing', () => {
    expect(parseItineraryItemDeleteSpec('帮我把第二天的酒店删了')).toEqual({
      dayNumber: 2,
      poiQuery: '酒店',
    });
  });

  it('parses day number and poi query', () => {
    expect(parseItineraryItemDeleteSpec('删除第3天的斯科加瀑布poi')).toEqual({
      dayNumber: 3,
      poiQuery: '斯科加瀑布',
    });
  });

  it('resolves item ids on target day only', () => {
    const trip = {
      days: [
        {
          items: [{ id: 'a1', place: { nameCN: '其他景点' } }],
        },
        {
          items: [{ id: 'a2', place: { nameCN: '其他' } }],
        },
        {
          items: [
            { id: 'skoga-1', place: { nameCN: '斯科加瀑布' } },
            { id: 'skoga-2', place: { nameEN: 'Skógafoss' } },
          ],
        },
      ],
    };
    const spec = parseItineraryItemDeleteSpec('删除第3天的斯科加瀑布poi')!;
    expect(resolveItemIdsForDeleteFromTrip(trip, spec)).toEqual(['skoga-1', 'skoga-2']);
  });

  it('falls back to other day when requested day has no match', () => {
    const trip = {
      days: [
        { items: [{ id: 'd1', place: { nameCN: '其他' } }] },
        { items: [{ id: 'skoga-1', place: { nameCN: '斯科加瀑布' } }] },
        { items: [{ id: 'd3', place: { nameCN: '无关' } }] },
      ],
    };
    const spec = parseItineraryItemDeleteSpec('删除第3天的斯科加瀑布poi')!;
    const resolved = resolveItemIdsForDeleteWithFallback(trip, spec);
    expect(resolved.itemIds).toEqual(['skoga-1']);
    expect(resolved.usedDayFallback).toBe(true);
    expect(resolved.matchedDayNumber).toBe(2);
    expect(buildItineraryItemDeleteAnswerText(spec, 1, resolved)).toContain('第2天');
  });

  it('builds user-facing answer text', () => {
    const spec = { dayNumber: 3, poiQuery: '斯科加瀑布' };
    expect(buildItineraryItemDeleteAnswerText(spec, 1)).toContain('第3天');
    expect(buildItineraryItemDeleteAnswerText(spec, 0)).toContain('未在');
  });
});
