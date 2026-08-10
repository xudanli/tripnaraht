/**
 * Derive lodging hours uncertainty from plan hotel slots + optional Place OH.
 * Omit when no hotel slot — never invent a lodging card.
 */

import type { TripPlan } from '../../../../trips/decision/plan-model';
import { parseIsoTimeToMinutes } from '../../../../trips/decision/utils/weather-slot-delay.util';
import type { LodgingHoursInput } from './iceland-winter-knowledge.types';
import { lodgingHoursFromOpeningRaw } from './map-osm-to-lodging-opening-mode';

const HOTEL_TYPES = new Set([
  'hotel',
  'HOTEL',
  'LODGING',
  'ACCOMMODATION',
  'GUESTHOUSE',
  'HOSTEL',
]);

export function isHotelPlanSlotType(type: string | undefined): boolean {
  if (!type) return false;
  return HOTEL_TYPES.has(type) || HOTEL_TYPES.has(type.toUpperCase());
}

/**
 * First hotel slot on focus/first day → lodging hours input.
 * openingHoursByPoiId supplies Place metadata.openingHours when known.
 */
export function resolveLodgingHoursFromPlan(opts: {
  plan?: TripPlan;
  openingHoursByPoiId?: Record<string, string | null | undefined>;
  /** policies.microRepair.hotelCheckinLatest as local minutes */
  hotelCheckinLatestLocalMin?: number;
}): LodgingHoursInput | undefined {
  const day = opts.plan?.days?.find((d) =>
    d.timeSlots.some((s) => isHotelPlanSlotType(String(s.type))),
  ) ?? opts.plan?.days?.[0];
  if (!day) return undefined;

  const hotel = day.timeSlots.find((s) => isHotelPlanSlotType(String(s.type)));
  if (!hotel) return undefined;

  const poiId = hotel.poiId?.trim();
  const oh =
    poiId && opts.openingHoursByPoiId
      ? opts.openingHoursByPoiId[poiId]
      : undefined;

  const latestFromSlot =
    hotel.endTime || hotel.time
      ? parseIsoTimeToMinutes((hotel.endTime ?? hotel.time) as string)
      : undefined;

  return lodgingHoursFromOpeningRaw({
    openingHours: oh,
    forceUnknown: oh == null || String(oh).trim() === '',
    latestArrivalLocalMin:
      opts.hotelCheckinLatestLocalMin ?? latestFromSlot,
  });
}
