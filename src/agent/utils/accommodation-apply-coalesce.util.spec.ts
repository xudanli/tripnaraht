import {
  coalesceAccommodationForApply,
  resolveAccommodationDisplayName,
} from './accommodation-apply-coalesce.util';

describe('accommodation-apply-coalesce.util', () => {
  it('merges route_and_run card fields into AccommodationItemDto', () => {
    const merged = coalesceAccommodationForApply(
      {
        id: 'abc',
        source: 'hotel',
        name_en: 'Hotel Vik',
        priceLabel: '¥900/晚',
        check_in: '2026-06-02',
      },
      { source: 'hotel', id: 'abc', name: '' },
    );
    expect(merged.name).toBe('Hotel Vik');
    expect(merged.nameEN).toBe('Hotel Vik');
    expect(merged.price).toBe('¥900/晚');
    expect(merged.checkIn).toBe('2026-06-02');
  });

  it('resolveAccommodationDisplayName prefers name over generic fallbacks', () => {
    expect(resolveAccommodationDisplayName({ name: 'Cozy Cabin', source: 'airbnb' })).toBe('Cozy Cabin');
    expect(resolveAccommodationDisplayName({ name_en: 'Guesthouse Hof', source: 'hotel' })).toBe('Guesthouse Hof');
  });
});
