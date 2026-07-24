import {
  attachDisplaySortIndices,
  isCheckoutDisplayItem,
  sortItineraryItemsForDayDisplay,
} from './itinerary-day-display-order.util';

describe('itinerary-day-display-order.util', () => {
  it('places checkout items before timed activities', () => {
    const items = [
      { id: 'a1', startTime: '2026-06-02T09:00:00.000Z', crossDayInfo: { displayMode: 'normal' } },
      {
        id: 'co',
        startTime: '2026-06-02T09:00:00.000Z',
        crossDayInfo: { isCheckoutItem: true, displayMode: 'checkout' },
      },
      { id: 'a2', startTime: '2026-06-02T11:00:00.000Z', crossDayInfo: { displayMode: 'normal' } },
    ];
    const sorted = sortItineraryItemsForDayDisplay(items);
    expect(sorted.map((i) => i.id)).toEqual(['co', 'a1', 'a2']);
    expect(isCheckoutDisplayItem(sorted[0])).toBe(true);
  });

  it('assigns displaySortIndex with checkout at 0', () => {
    const items = attachDisplaySortIndices([
      { id: 'a1', startTime: '2026-06-02T09:00:00.000Z' },
      { id: 'co', startTime: '2026-06-02T09:00:00.000Z', _isCheckoutItem: true },
    ]);
    expect(items[0].id).toBe('co');
    expect(items[0].displaySortIndex).toBe(0);
    expect(items[1].displaySortIndex).toBe(1);
  });
});
