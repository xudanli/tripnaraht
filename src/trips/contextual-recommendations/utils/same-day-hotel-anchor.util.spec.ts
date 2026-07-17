import { resolveSameDayHotelAnchor } from './same-day-hotel-anchor.util';
import type { SameDayHotelDaySlice } from './same-day-hotel-anchor.util';

function hotelPlace(overrides?: {
  id?: number;
  nameCN?: string;
  lat?: number;
  lng?: number;
  city?: string;
}) {
  return {
    id: overrides?.id ?? 1,
    nameCN: overrides?.nameCN ?? 'Reykjavik Centrum',
    nameEN: 'Reykjavik Centrum',
    category: 'HOTEL',
    address: null,
    metadata: {
      lat: overrides?.lat ?? 64.1466,
      lng: overrides?.lng ?? -21.9426,
    },
    City: {
      nameCN: overrides?.city ?? '雷克雅未克',
      name: 'Reykjavik',
      nameEN: 'Reykjavik',
    },
  };
}

describe('resolveSameDayHotelAnchor', () => {
  it('prefers confirmed hotel on focus day', () => {
    const days: SameDayHotelDaySlice[] = [
      {
        dayIndex: 1,
        items: [
          {
            type: 'ACTIVITY',
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: hotelPlace({ id: 10, nameCN: 'Focus Hotel' }),
          },
        ],
      },
    ];
    const { hotel, sourceNote } = resolveSameDayHotelAnchor({
      focusDayIndex: 1,
      days,
    });
    expect(hotel?.name).toBe('Focus Hotel');
    expect(hotel?.anchorSource).toBe('FOCUS_DAY');
    expect(hotel?.confirmed).toBe(true);
    expect(sourceNote).toBe('day1.accommodation');
  });

  it('walks back to prior overnight when focus day has no hotel', () => {
    const days: SameDayHotelDaySlice[] = [
      {
        dayIndex: 1,
        items: [
          {
            type: 'ACTIVITY',
            note: null,
            bookingStatus: 'CONFIRMED',
            Place: hotelPlace({ id: 20, nameCN: 'Check-in Hotel' }),
          },
        ],
      },
      {
        dayIndex: 2,
        items: [
          {
            type: 'ACTIVITY',
            note: null,
            bookingStatus: null,
            Place: {
              id: 99,
              nameCN: 'Golden Circle',
              nameEN: 'Golden Circle',
              category: 'ATTRACTION',
              address: null,
              metadata: {},
              City: null,
            },
          },
        ],
      },
    ];
    const { hotel, sourceNote } = resolveSameDayHotelAnchor({
      focusDayIndex: 2,
      days,
    });
    expect(hotel?.name).toBe('Check-in Hotel');
    expect(hotel?.anchorSource).toBe('PRIOR_OVERNIGHT');
    expect(hotel?.anchorDayIndex).toBe(1);
    expect(sourceNote).toContain('overnight(day2)');
  });

  it('returns null when no accommodation exists', () => {
    const { hotel, sourceNote } = resolveSameDayHotelAnchor({
      focusDayIndex: 1,
      days: [{ dayIndex: 1, items: [] }],
    });
    expect(hotel).toBeNull();
    expect(sourceNote).toBeNull();
  });
});
