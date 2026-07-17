import { isAccommodationItem } from '../../utils/accommodation-overview.util';
import { resolvePlaceCoordinates } from '../../../places/utils/place-coordinates.util';
import type { CanonicalHotelFact } from '../types/contextual-recommendations.types';

export type SameDayHotelAnchorSource = 'FOCUS_DAY' | 'PRIOR_OVERNIGHT';

export type SameDayHotelDayItem = {
  type: string;
  note: string | null;
  bookingStatus: string | null;
  Place: {
    id: number;
    nameCN: string | null;
    nameEN: string | null;
    category: string;
    address: string | null;
    metadata: unknown;
    City: { nameCN: string | null; name: string | null; nameEN: string | null } | null;
  } | null;
};

export type SameDayHotelDaySlice = {
  dayIndex: number; // 1-based
  items: SameDayHotelDayItem[];
};

const CONFIRMED = new Set(['BOOKED', 'CONFIRMED', 'COMPLETED']);

function isConfirmed(status: string | null | undefined): boolean {
  return CONFIRMED.has(String(status ?? '').toUpperCase());
}

function toHotelFact(
  item: SameDayHotelDayItem,
  source: SameDayHotelAnchorSource,
  dayIndex: number,
): CanonicalHotelFact {
  const place = item.Place;
  const coords = place ? resolvePlaceCoordinates(place as never) : null;
  const cityName =
    place?.City?.nameCN?.trim() ||
    place?.City?.name?.trim() ||
    place?.City?.nameEN?.trim() ||
    null;
  return {
    name: place?.nameCN || place?.nameEN || '酒店',
    cityName,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    confirmed: isConfirmed(item.bookingStatus),
    placeId: place?.id ?? null,
    anchorSource: source,
    anchorDayIndex: dayIndex,
  };
}

function pickFromDay(
  day: SameDayHotelDaySlice,
  source: SameDayHotelAnchorSource,
): CanonicalHotelFact | null {
  const hits: CanonicalHotelFact[] = [];
  for (const item of day.items) {
    const place = item.Place;
    const row = {
      type: item.type,
      placeCategory: place?.category ?? null,
      placeNameCN: place?.nameCN ?? null,
      placeNameEN: place?.nameEN ?? null,
      note: item.note,
    };
    if (!isAccommodationItem(row) && place?.category !== 'HOTEL') continue;
    hits.push(toHotelFact(item, source, day.dayIndex));
  }
  if (hits.length === 0) return null;
  const confirmed = hits.find((h) => h.confirmed);
  return confirmed ?? hits[0];
}

/**
 * Resolve tonight's hotel anchor for same-day micro-planning.
 *
 * Priority:
 * 1. Focus day accommodation (confirmed preferred)
 * 2. Walk back prior days — multi-night stay often only listed on check-in day
 */
export function resolveSameDayHotelAnchor(input: {
  focusDayIndex: number;
  days: SameDayHotelDaySlice[];
}): {
  hotel: CanonicalHotelFact | null;
  sourceNote: string | null;
} {
  const focus = input.days.find((d) => d.dayIndex === input.focusDayIndex);
  if (focus) {
    const onFocus = pickFromDay(focus, 'FOCUS_DAY');
    if (onFocus) {
      return {
        hotel: onFocus,
        sourceNote: `day${input.focusDayIndex}.accommodation`,
      };
    }
  }

  for (let di = input.focusDayIndex - 1; di >= 1; di -= 1) {
    const prior = input.days.find((d) => d.dayIndex === di);
    if (!prior) continue;
    const hit = pickFromDay(prior, 'PRIOR_OVERNIGHT');
    if (hit) {
      return {
        hotel: hit,
        sourceNote: `day${di}.accommodation→overnight(day${input.focusDayIndex})`,
      };
    }
  }

  return { hotel: null, sourceNote: null };
}
