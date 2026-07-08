import type { GuideItineraryDraft } from '../services/guide-plan-builder.service';
import {
  appendAccommodationHotelItems,
  enrichItineraryDraftAccommodation,
  fillMissingDayAccommodation,
  splitHotelItemsFromDays,
} from './guide-itinerary-accommodation.util';

describe('guide-itinerary-accommodation.util', () => {
  const baseDraft: GuideItineraryDraft = {
    totalDays: 2,
    variant: 'balanced',
    sourceConfidence: 0.3,
    warnings: [],
    days: [
      {
        day: 1,
        date: '2026-08-01',
        items: [
          {
            name: '蓝湖',
            type: 'poi',
            startTime: '2026-08-01T09:00:00.000Z',
            endTime: '2026-08-01T11:00:00.000Z',
            source: 'guide',
          },
          {
            candidateId: 'h1',
            name: '雷克雅未克市区酒店',
            type: 'hotel',
            startTime: '2026-08-01T10:00:00.000Z',
            endTime: '2026-08-01T10:30:00.000Z',
            source: 'guide',
          },
        ],
        activityCount: 2,
      },
      {
        day: 2,
        date: '2026-08-02',
        items: [
          {
            name: '黄金圈',
            type: 'poi',
            startTime: '2026-08-02T09:00:00.000Z',
            endTime: '2026-08-02T11:00:00.000Z',
            source: 'guide',
          },
        ],
        activityCount: 1,
      },
    ],
  };

  it('moves hotel from items to accommodation and adds evening hotel node', () => {
    const enriched = enrichItineraryDraftAccommodation(baseDraft, [
      {
        id: 'h2',
        rawName: '维克镇',
        placeId: null,
        suggestedDay: 2,
      },
    ]);

    expect(enriched.days[0].accommodation?.name).toBe('雷克雅未克市区酒店');
    expect(enriched.days[0].items.filter((i) => i.type === 'hotel')).toHaveLength(1);
    expect(enriched.days[0].items[0].type).toBe('poi');
    expect(enriched.days[0].items[1].type).toBe('hotel');
    expect(enriched.days[0].items[1].startTime).toContain('T20:00:00');

    expect(enriched.days[1].accommodation?.name).toBe('维克镇');
    expect(enriched.days[1].items.some((i) => i.type === 'hotel')).toBe(true);
  });

  it('splitHotelItemsFromDays keeps only daytime activities', () => {
    const days = baseDraft.days.map((d) => ({
      ...d,
      items: d.items.map((i) => ({ ...i })),
    }));
    splitHotelItemsFromDays(days);
    fillMissingDayAccommodation(days, [], '冰岛');
    appendAccommodationHotelItems(days);

    expect(days[0].items.filter((i) => i.type !== 'hotel')).toHaveLength(1);
    expect(days[0].accommodation).toBeDefined();
  });
});
