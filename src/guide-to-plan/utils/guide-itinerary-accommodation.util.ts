import { DateTime } from 'luxon';
import type {
  GuideItineraryDraft,
  GuideItineraryDraftDay,
  GuideItineraryDraftItem,
  GuideItineraryDayAccommodation,
} from '../services/guide-plan-builder.service';

export type GuideHotelCandidateRef = {
  id: string;
  rawName: string;
  rawNameEn?: string | null;
  placeId: number | null;
  suggestedDay: number | null;
  lat?: number;
  lng?: number;
};

export function itemToAccommodation(
  item: GuideItineraryDraftItem,
  coords?: { lat?: number; lng?: number },
): GuideItineraryDayAccommodation {
  return {
    candidateId: item.candidateId,
    placeId: item.placeId,
    name: item.name,
    type: 'hotel',
    source: item.source,
    geo:
      coords?.lat != null && coords?.lng != null
        ? { lat: coords.lat, lng: coords.lng }
        : undefined,
  };
}

export function candidateToAccommodation(
  c: GuideHotelCandidateRef,
  source: GuideItineraryDayAccommodation['source'] = 'guide',
): GuideItineraryDayAccommodation {
  return {
    candidateId: c.id,
    placeId: c.placeId,
    name: c.rawName,
    nameEn: c.rawNameEn ?? undefined,
    type: 'hotel',
    source,
    geo:
      c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : undefined,
  };
}

export function splitHotelItemsFromDays(days: GuideItineraryDraftDay[]): void {
  for (const day of days) {
    const hotelItems = day.items.filter((i) => i.type === 'hotel');
    if (hotelItems.length === 0) continue;

    day.items = day.items.filter((i) => i.type !== 'hotel');
    if (!day.accommodation) {
      day.accommodation = itemToAccommodation(hotelItems[0]);
    }
    day.activityCount = day.items.length;
  }
}

export function fillMissingDayAccommodation(
  days: GuideItineraryDraftDay[],
  hotelPool: GuideHotelCandidateRef[],
  destinationHint?: string | null,
): void {
  const usedIds = new Set<string>();
  let lastAcc: GuideItineraryDayAccommodation | undefined;

  for (const day of days) {
    if (day.accommodation) {
      if (day.accommodation.candidateId) usedIds.add(day.accommodation.candidateId);
      lastAcc = day.accommodation;
      continue;
    }

    const dayHotel = hotelPool.find(
      (h) => h.suggestedDay === day.day && !usedIds.has(h.id),
    );
    if (dayHotel) {
      day.accommodation = candidateToAccommodation(dayHotel);
      usedIds.add(dayHotel.id);
      lastAcc = day.accommodation;
      continue;
    }

    if (lastAcc) {
      day.accommodation = {
        ...lastAcc,
        source: 'inferred',
        areaHint: lastAcc.areaHint ?? '沿用上一晚住宿区域（攻略未指定当日酒店）',
      };
      continue;
    }

    const fallbackHotel = hotelPool.find((h) => !usedIds.has(h.id));
    if (fallbackHotel) {
      day.accommodation = candidateToAccommodation(fallbackHotel, 'inferred');
      usedIds.add(fallbackHotel.id);
      lastAcc = day.accommodation;
      continue;
    }

    if (destinationHint?.trim()) {
      day.accommodation = {
        name: destinationHint.trim(),
        type: 'area',
        source: 'inferred',
        areaHint: '攻略未指定具体酒店，建议结合当日终点区域自行预订',
      };
    }
  }
}

export function appendAccommodationHotelItems(days: GuideItineraryDraftDay[]): void {
  for (const day of days) {
    if (!day.accommodation) continue;
    if (day.items.some((i) => i.type === 'hotel')) continue;

    const baseDate = day.date ?? '1970-01-01';
    const checkIn = DateTime.fromISO(`${baseDate}T20:00:00.000Z`, { zone: 'utc' });
    const acc = day.accommodation;
    const checkInIso = checkIn.toISO()!;

    day.accommodation = { ...acc, checkInTime: checkInIso };

    day.items.push({
      candidateId: acc.candidateId,
      placeId: acc.placeId,
      name: acc.name,
      type: 'hotel',
      startTime: checkInIso,
      endTime: checkIn.plus({ minutes: 30 }).toISO()!,
      source: acc.source === 'inferred' ? 'adjusted' : acc.source,
      visitDurationMinutes: 30,
    });
    day.activityCount = day.items.length;
  }
}

/**
 * BFF：为已持久化的草案补全 accommodation / 晚间 hotel 节点（兼容旧数据）。
 */
export function enrichItineraryDraftAccommodation(
  draft: GuideItineraryDraft,
  hotelCandidates: GuideHotelCandidateRef[] = [],
  destinationHint?: string | null,
): GuideItineraryDraft {
  const days: GuideItineraryDraftDay[] = draft.days.map((day) => ({
    ...day,
    items: day.items.map((item) => ({ ...item })),
    accommodation: day.accommodation ? { ...day.accommodation } : undefined,
  }));

  for (const day of days) {
    if (day.accommodation) continue;
    const hotelItem = day.items.find((i) => i.type === 'hotel');
    if (hotelItem) {
      day.accommodation = itemToAccommodation(hotelItem);
    }
  }

  splitHotelItemsFromDays(days);
  fillMissingDayAccommodation(days, hotelCandidates, destinationHint);
  appendAccommodationHotelItems(days);

  return { ...draft, days };
}
