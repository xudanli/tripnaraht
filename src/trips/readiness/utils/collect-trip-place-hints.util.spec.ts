import { collectTripPlaceNameHints } from './collect-trip-place-hints.util';

describe('collectTripPlaceNameHints', () => {
  it('collects place and city names without duplicates', () => {
    const hints = collectTripPlaceNameHints([
      {
        ItineraryItem: [
          {
            Place: {
              nameCN: '布达拉宫',
              nameEN: 'Potala Palace',
              City: { nameCN: '拉萨', nameEN: 'Lhasa', name: 'Lhasa' },
            },
          },
          {
            Place: {
              nameCN: '布达拉宫',
              nameEN: 'Potala Palace',
              City: { nameCN: '拉萨', nameEN: 'Lhasa', name: 'Lhasa' },
            },
          },
        ],
      },
    ]);
    expect(hints).toEqual(['布达拉宫', 'Potala Palace', '拉萨', 'Lhasa']);
  });

  it('respects max cap', () => {
    const hints = collectTripPlaceNameHints(
      [
        {
          ItineraryItem: [
            { Place: { nameCN: 'A', nameEN: 'a' } },
            { Place: { nameCN: 'B', nameEN: 'b' } },
            { Place: { nameCN: 'C', nameEN: 'c' } },
          ],
        },
      ],
      { max: 3 },
    );
    expect(hints).toHaveLength(3);
  });

  it('returns empty for missing days', () => {
    expect(collectTripPlaceNameHints(null)).toEqual([]);
    expect(collectTripPlaceNameHints(undefined)).toEqual([]);
  });
});
