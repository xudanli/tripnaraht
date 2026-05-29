import {
  openingHoursEvidenceToText,
  suggestActivitySlotForDayAdd,
} from './itinerary-item-add-slot.util';

describe('itinerary-item-add-slot.util', () => {
  it('places scenic spot in daytime gap before evening hotel check-in', () => {
    const suggestion = suggestActivitySlotForDayAdd({
      tripDayDate: '2026-06-03',
      items: [
        {
          startTime: '2026-06-03T18:00:00.000Z',
          endTime: '2026-06-03T23:00:00.000Z',
        },
      ],
      openingHoursText: 'Summer 8:00-18:00, Winter 9:00-17:00',
      poiQuery: '斯卡夫塔山国家公园',
      placeCategory: 'ATTRACTION',
    });

    expect(suggestion.startTime).toBe('2026-06-03T11:30:00.000Z');
    expect(suggestion.endTime).toBe('2026-06-03T14:00:00.000Z');
    expect(suggestion.reasonZh).toContain('白天');
  });

  it('does not schedule after last item when last item ends late evening', () => {
    const suggestion = suggestActivitySlotForDayAdd({
      tripDayDate: '2026-06-03',
      items: [
        {
          startTime: '2026-06-03T18:00:00.000Z',
          endTime: '2026-06-03T23:00:00.000Z',
        },
      ],
      openingHoursText: null,
      poiQuery: '国家公园',
    });

    const startHour = new Date(suggestion.startTime).getUTCHours();
    expect(startHour).toBeGreaterThanOrEqual(8);
    expect(startHour).toBeLessThan(18);
  });

  it('extracts opening hours from evidence metadata', () => {
    expect(
      openingHoursEvidenceToText(
        { description: 'Summer 8:00-18:00, Winter 9:00-17:00' },
        new Date('2026-06-03'),
      ),
    ).toBe('8:00-18:00');
  });
});
