/**
 * DailyDrivePlan — 只读投影（TripDay + ItineraryItem → TEP）
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 B
 */

import { isAccommodationItem } from '../../utils/accommodation-overview.util';
import { tepNoteToMetadata } from '../utils/tep-item-note.parser';
import type {
  AccommodationAnchor,
  DailyDrivePlan,
  DriveLeg,
  PlanFlexibility,
  PlanImportance,
  PlannedActivity,
  PlanningBuffer,
  RouteAnchor,
} from '../contracts/tep-self-drive.types';

export interface TripDayRow {
  id: string;
  date: Date | string;
}

export interface ItineraryItemRow {
  id: string;
  tripDayId: string;
  type: string;
  order?: number | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  note?: string | null;
  placeId?: number | null;
  placeNameCN?: string | null;
  placeNameEN?: string | null;
  placeCategory?: string | null;
  placeLat?: number | null;
  placeLng?: number | null;
  costCategory?: string | null;
  bookingStatus?: string | null;
  travelFromPreviousDuration?: number | null;
  travelFromPreviousDistance?: number | null;
  travelMode?: string | null;
}

export interface DailyDrivePlanProjectorInput {
  tripId: string;
  planVersionId: string;
  tripDays: TripDayRow[];
  itemsByDayId: Map<string, ItineraryItemRow[]>;
}

function sortTripDays(days: TripDayRow[]): TripDayRow[] {
  return [...days].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function sortItems(items: ItineraryItemRow[]): ItineraryItemRow[] {
  return [...items].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    return orderDiff !== 0 ? orderDiff : a.id.localeCompare(b.id);
  });
}

function formatDateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function formatIsoLocalTime(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function itemLabel(item: ItineraryItemRow): string {
  const name = `${item.placeNameCN ?? ''} ${item.placeNameEN ?? ''}`.trim();
  if (name) return name;
  const note = item.note?.trim();
  if (note && !note.startsWith('{')) return note;
  return item.id;
}

function toRouteAnchor(item: ItineraryItemRow): RouteAnchor {
  const placeId = item.placeId != null ? String(item.placeId) : undefined;
  return {
    ref: placeId ? `anchor_${placeId}` : `anchor_${item.id}`,
    placeId,
    ...(typeof item.placeLat === 'number' ? { lat: item.placeLat } : {}),
    ...(typeof item.placeLng === 'number' ? { lng: item.placeLng } : {}),
    label: itemLabel(item),
  };
}

function readItemMetadata(item: ItineraryItemRow): Record<string, unknown> {
  return tepNoteToMetadata(item.note ?? null);
}

function isReservationAnchored(item: ItineraryItemRow): boolean {
  const note = String(item.note ?? '').toLowerCase();
  if (note.includes('[fixed-anchor]') || note.includes('[不可调整]')) return true;
  const status = String(item.bookingStatus ?? '').toUpperCase();
  return status === 'CONFIRMED' || status === 'BOOKED' || status === 'NON_REFUNDABLE';
}

function isActivityItem(item: ItineraryItemRow): boolean {
  if (isAccommodationItem(item)) return false;
  const type = item.type.toUpperCase();
  if (type === 'REST') return false;
  return type === 'ACTIVITY' || type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING' || type === 'TRANSIT';
}

function isBufferItem(item: ItineraryItemRow): boolean {
  if (isAccommodationItem(item)) return false;
  const type = item.type.toUpperCase();
  if (type !== 'REST') return false;
  const meta = readItemMetadata(item);
  return typeof meta.bufferMinutes === 'number' || meta.kind === 'buffer';
}

function resolveImportanceAndFlexibility(
  item: ItineraryItemRow,
  ctx: {
    isSoleAccommodation: boolean;
    hasReservation: boolean;
  },
): { importance: PlanImportance; flexibility: PlanFlexibility } {
  const meta = readItemMetadata(item);
  const storedImportance = meta.tepImportance;
  const storedFlexibility = meta.tepFlexibility;

  if (
    storedImportance === 'MANDATORY' ||
    storedImportance === 'RECOMMENDED' ||
    storedImportance === 'OPTIONAL'
  ) {
    return {
      importance: storedImportance,
      flexibility:
        storedFlexibility === 'FIXED' ||
        storedFlexibility === 'MOVABLE' ||
        storedFlexibility === 'REPLACEABLE' ||
        storedFlexibility === 'REMOVABLE'
          ? storedFlexibility
          : 'MOVABLE',
    };
  }

  if (meta.mustDo === true || meta.isMustDo === true) {
    return { importance: 'MANDATORY', flexibility: 'MOVABLE' };
  }

  if (ctx.isSoleAccommodation) {
    return { importance: 'MANDATORY', flexibility: 'FIXED' };
  }

  if (ctx.hasReservation) {
    return { importance: 'MANDATORY', flexibility: 'FIXED' };
  }

  const type = item.type.toUpperCase();
  if (type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING') {
    return { importance: 'OPTIONAL', flexibility: 'REPLACEABLE' };
  }

  return { importance: 'RECOMMENDED', flexibility: 'REMOVABLE' };
}

function activityDurationMinutes(item: ItineraryItemRow): number {
  const meta = readItemMetadata(item);
  if (typeof meta.durationMinutes === 'number' && meta.durationMinutes >= 0) {
    return meta.durationMinutes;
  }
  if (item.startTime && item.endTime) {
    const start = new Date(item.startTime).getTime();
    const end = new Date(item.endTime).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      return Math.round((end - start) / 60_000);
    }
  }
  return 60;
}

function readRoadRefs(item: ItineraryItemRow): string[] {
  const meta = readItemMetadata(item);
  const routeSegmentId = meta.routeSegmentId ?? meta.route_segment_id;
  if (typeof routeSegmentId === 'string' && routeSegmentId.trim()) {
    return [routeSegmentId];
  }
  if (Array.isArray(meta.roadRefs)) {
    return meta.roadRefs.map(String);
  }
  return [];
}

function buildDriveLegs(
  dayIndex: number,
  items: ItineraryItemRow[],
): DriveLeg[] {
  const legs: DriveLeg[] = [];
  let legSeq = 0;

  for (let i = 1; i < items.length; i += 1) {
    const fromItem = items[i - 1]!;
    const toItem = items[i]!;
    if (!isActivityItem(fromItem) && !isAccommodationItem(fromItem)) continue;
    if (!isActivityItem(toItem) && !isAccommodationItem(toItem)) continue;

    const duration = toItem.travelFromPreviousDuration;
    if (duration == null || duration <= 0) continue;

    legSeq += 1;
    const { importance, flexibility } = resolveImportanceAndFlexibility(toItem, {
      isSoleAccommodation: false,
      hasReservation: isReservationAnchored(toItem),
    });

    legs.push({
      legId: `drive_leg_${dayIndex}_${legSeq}`,
      fromRef: fromItem.id,
      toRef: toItem.id,
      baseNavigationMinutes: duration,
      roadRefs: readRoadRefs(toItem),
      importance,
      flexibility,
    });
  }

  return legs;
}

function buildActivities(
  items: ItineraryItemRow[],
  soleAccommodationId: string | null,
): PlannedActivity[] {
  return items
    .filter(isActivityItem)
    .map((item) => {
      const meta = readItemMetadata(item);
      const hasReservation = isReservationAnchored(item);
      const { importance, flexibility } = resolveImportanceAndFlexibility(item, {
        isSoleAccommodation: item.id === soleAccommodationId,
        hasReservation,
      });

      return {
        ref: `activity_${item.id}`,
        importance,
        flexibility,
        weatherSensitive: meta.weatherSensitive === true,
        reservationRequired: hasReservation,
        durationMinutes: activityDurationMinutes(item),
        bufferMinutes:
          typeof meta.bufferMinutes === 'number' && meta.bufferMinutes >= 0
            ? meta.bufferMinutes
            : 0,
        fixedStartAt: hasReservation ? formatIsoLocalTime(item.startTime) : undefined,
        ...(typeof meta.weatherFallbackRef === 'string'
          ? { weatherFallbackRef: meta.weatherFallbackRef }
          : {}),
        ...(typeof meta.weatherFallbackPoiId === 'string'
          ? { weatherFallbackPoiId: meta.weatherFallbackPoiId }
          : {}),
      };
    });
}

function buildAccommodation(
  items: ItineraryItemRow[],
): AccommodationAnchor | undefined {
  const accommodations = items.filter((item) => isAccommodationItem(item));
  if (accommodations.length === 0) return undefined;

  const anchor = accommodations[accommodations.length - 1]!;
  const meta = readItemMetadata(anchor);
  const latestArrival =
    typeof meta.latestArrival === 'string'
      ? meta.latestArrival
      : typeof meta.latest_arrival === 'string'
        ? meta.latest_arrival
        : undefined;

  const checkInFrom = formatIsoLocalTime(anchor.startTime);

  return {
    ref: `accommodation_${anchor.id}`,
    ...(checkInFrom ? { checkInFrom } : {}),
    ...(latestArrival ? { latestArrival } : {}),
    ...(meta.parkingRequired === true ? { parkingRequired: true } : {}),
  };
}

function buildBuffers(items: ItineraryItemRow[]): PlanningBuffer[] {
  const buffers: PlanningBuffer[] = [];

  for (const item of items) {
    const meta = readItemMetadata(item);
    if (typeof meta.bufferMinutes === 'number' && meta.bufferMinutes > 0) {
      buffers.push({
        ref: `buffer_${item.id}`,
        kind: meta.bufferKind === 'FUEL' ? 'FUEL' : meta.bufferKind === 'FLEX' ? 'FLEX' : 'TRANSIT',
        minutes: meta.bufferMinutes,
      });
      continue;
    }

    if (isBufferItem(item)) {
      const minutes = activityDurationMinutes(item);
      buffers.push({
        ref: `buffer_${item.id}`,
        kind: 'REST',
        minutes: minutes > 0 ? minutes : 15,
      });
    }
  }

  return buffers;
}

function resolveDayAnchors(items: ItineraryItemRow[]): {
  origin: RouteAnchor;
  destination: RouteAnchor;
} {
  const stops = items.filter((item) => isActivityItem(item) || isAccommodationItem(item));
  const fallback = items[0];
  const originItem = stops[0] ?? fallback;
  const destinationItem = stops[stops.length - 1] ?? fallback;

  if (!originItem || !destinationItem) {
    const empty: RouteAnchor = { ref: 'anchor_unknown', label: 'Unknown' };
    return { origin: empty, destination: empty };
  }

  return {
    origin: toRouteAnchor(originItem),
    destination: toRouteAnchor(destinationItem),
  };
}

/** 只读投影 TripDay + ItineraryItem → DailyDrivePlan[] */
export function projectDailyDrivePlans(input: DailyDrivePlanProjectorInput): DailyDrivePlan[] {
  const sortedDays = sortTripDays(input.tripDays);

  return sortedDays.map((day, index) => {
    const dayIndex = index + 1;
    const items = sortItems(input.itemsByDayId.get(day.id) ?? []);
    const accommodations = items.filter((item) => isAccommodationItem(item));
    const soleAccommodationId =
      accommodations.length === 1 ? accommodations[0]!.id : null;
    const anchors = resolveDayAnchors(items);

    return {
      date: formatDateOnly(day.date),
      dayIndex,
      origin: anchors.origin,
      destination: anchors.destination,
      legs: buildDriveLegs(dayIndex, items),
      accommodation: buildAccommodation(items),
      activities: buildActivities(items, soleAccommodationId),
      buffers: buildBuffers(items),
    };
  });
}
