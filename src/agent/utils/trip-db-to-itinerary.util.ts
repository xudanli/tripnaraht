/**
 * Convert Prisma Trip (findOne) row → agent Itinerary for rollout / IR compile.
 */

import type { Itinerary, ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';

type TripDayRow = {
  date?: Date | string | null;
  ItineraryItem?: TripItemRow[];
  items?: TripItemRow[];
};

type TripItemRow = {
  id: string;
  type?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  note?: string | null;
  placeId?: number | null;
  Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
  place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
};

type TripDbLike = {
  id?: string;
  TripDay?: TripDayRow[];
  days?: TripDayRow[];
};

function isoOrString(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function isoOrWindow(v: Date | string | null | undefined, fallback: string): string {
  const iso = isoOrString(v);
  return iso ?? fallback;
}

function mapItem(it: TripItemRow): ItineraryItem {
  const place = it.Place ?? it.place;
  const placeId = it.placeId ?? place?.id;
  const name = place?.nameCN ?? place?.nameEN ?? it.note ?? 'Activity';
  return {
    id: String(it.id),
    type: (String(it.type ?? 'POI').toUpperCase() as ItineraryItem['type']) || 'POI',
    start_window: isoOrWindow(it.startTime, '09:00'),
    end_window: isoOrWindow(it.endTime, '10:00'),
    location_ref: {
      place_id: placeId != null ? String(placeId) : undefined,
      name: String(name),
    },
    evidence_refs: [],
    verified: false,
    verification_status: 'ASSUMPTION',
  };
}

export function tripDbRowToItinerary(trip: TripDbLike): Itinerary | null {
  const tripDays = trip.TripDay ?? trip.days;
  if (!Array.isArray(tripDays) || !tripDays.length) return null;

  const days: ItineraryDay[] = tripDays.map((d) => {
    const itemsRaw = d.ItineraryItem ?? d.items ?? [];
    const date =
      typeof d.date === 'string'
        ? d.date.slice(0, 10)
        : d.date instanceof Date
          ? d.date.toISOString().slice(0, 10)
          : '';
    return {
      date,
      items: itemsRaw.map(mapItem),
    };
  });

  return {
    request_id: trip.id ?? 'trip',
    days,
  };
}

export function tripDbRowHasSchedulableItems(trip: TripDbLike): boolean {
  const itinerary = tripDbRowToItinerary(trip);
  return Boolean(itinerary?.days?.some((d) => (d.items?.length ?? 0) > 0));
}
