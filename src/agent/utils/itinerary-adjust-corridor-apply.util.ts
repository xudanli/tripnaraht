/**
 * 将 PLAN_GEN 产出的目标日 POI 骨架转为 trip.applyEdit（delete + add）编辑批次。
 */

import { DateTime } from 'luxon';
import type { ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';
import {
  collectActivityItemIdsForDayReplan,
  resolveTripDayByDate,
} from './itinerary-day-replan.util';
import type { TripLikeForDelete } from './itinerary-item-delete.util';

const POI_LIKE_TYPES = new Set(['POI', 'ACTIVITY', 'VIEWPOINT', 'NATURE', 'RESTAURANT']);

export function pickTargetDayFromItinerary(
  itinerary: { days?: ItineraryDay[] } | undefined,
  targetDateIso: string,
): ItineraryDay | undefined {
  if (!itinerary?.days?.length) return undefined;
  return itinerary.days.find((d) => String(d.date ?? '').slice(0, 10) === targetDateIso);
}

export function collectPoiItemsForCorridorApply(day: ItineraryDay): ItineraryItem[] {
  return (day.items ?? []).filter((it) => POI_LIKE_TYPES.has(String(it.type ?? 'POI').toUpperCase()));
}

export function parseNumericPlaceId(raw: unknown): number | undefined {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return undefined;
}

export function toIsoVisitWindows(
  tripDayDate: Date | string | null | undefined,
  startWindow: string,
  endWindow: string,
  timezone = 'Atlantic/Reykjavik',
): { startTime: string; endTime: string } | null {
  const sw = String(startWindow ?? '').trim();
  const ew = String(endWindow ?? '').trim();
  if (!sw || !ew) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(sw) && /^\d{4}-\d{2}-\d{2}T/.test(ew)) {
    return { startTime: sw, endTime: ew };
  }
  const dayStart = tripDayDate
    ? DateTime.fromJSDate(
        tripDayDate instanceof Date ? tripDayDate : new Date(String(tripDayDate)),
        { zone: 'utc' },
      ).startOf('day')
    : DateTime.now().setZone(timezone).startOf('day');

  const parseHm = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return dayStart.setZone(timezone).set({ hour: h, minute: m, second: 0, millisecond: 0 });
  };

  if (!/^\d{1,2}:\d{2}$/.test(sw) || !/^\d{1,2}:\d{2}$/.test(ew)) return null;
  const startDt = parseHm(sw);
  const endDt = parseHm(ew);
  return {
    startTime: startDt.toUTC().toISO()!,
    endTime: endDt.toUTC().toISO()!,
  };
}

export type CorridorApplyEdit = {
  type: 'delete';
  itemId: string;
} | {
  type: 'add';
  tripDayId: string;
  placeId: number;
  startTime: string;
  endTime: string;
};

export function buildCorridorDayApplyEdits(params: {
  trip: TripLikeForDelete;
  targetDateIso: string;
  targetDay: ItineraryDay;
  resolvePlaceId: (item: ItineraryItem) => number | undefined;
}): {
  edits: CorridorApplyEdit[];
  deleteIds: string[];
  addCount: number;
  unresolvedItems: string[];
} {
  const dayResolved = resolveTripDayByDate(params.trip, params.targetDateIso);
  const tripDayId = dayResolved.tripDayId;
  if (!tripDayId) {
    return { edits: [], deleteIds: [], addCount: 0, unresolvedItems: ['day_not_found'] };
  }

  const deleteIds = collectActivityItemIdsForDayReplan(dayResolved.items);
  const edits: CorridorApplyEdit[] = deleteIds.map((itemId) => ({ type: 'delete', itemId }));

  const poiItems = collectPoiItemsForCorridorApply(params.targetDay);
  const unresolvedItems: string[] = [];
  let addCount = 0;
  const tripDayDate =
    dayResolved.dateIso ?? params.targetDateIso ?? params.targetDay.date;

  for (const item of poiItems) {
    const placeId = params.resolvePlaceId(item);
    if (placeId == null) {
      unresolvedItems.push(item.location_ref?.name ?? item.id);
      continue;
    }
    const windows = toIsoVisitWindows(tripDayDate, item.start_window, item.end_window);
    if (!windows) {
      unresolvedItems.push(`${item.location_ref?.name ?? item.id}:invalid_time`);
      continue;
    }
    edits.push({
      type: 'add',
      tripDayId,
      placeId,
      startTime: windows.startTime,
      endTime: windows.endTime,
    });
    addCount++;
  }

  return { edits, deleteIds, addCount, unresolvedItems };
}
