/**
 * Phase 4 — itinerary / accommodation / lunch_strategy → PlanObject 投影
 */

import { DateTime } from 'luxon';
import {
  buildMealBlockWindows,
  type LunchStrategy,
  resolveLunchStrategyFromTrip,
} from '../../../planning-policy/utils/lunch-strategy.util';
import {
  isAccommodationItem,
  type AccommodationItemRow,
} from '../../../trips/utils/accommodation-overview.util';
import type {
  PlanObject,
  PlanObjectAssessment,
  PlanObjectDayProjection,
  PlanObjectProjectionView,
  PlanObjectType,
} from '../contracts/plan-object.types';
import { assessPlanObjectDay } from './plan-object-day-assessment.util';

export type ItineraryItemRow = {
  id: string;
  type: string;
  tripDayId: string;
  startTime: Date | null;
  endTime: Date | null;
  note: string | null;
  placeId: number | null;
  costCategory: string | null;
  bookingStatus: string | null;
  travelFromPreviousDuration: number | null;
  travelFromPreviousDistance: number | null;
  travelMode: string | null;
  Place?: {
    nameCN: string | null;
    nameEN: string | null;
    category: string | null;
    address: string | null;
    physicalMetadata?: unknown;
  } | null;
};

export type TripDayRow = {
  id: string;
  date: Date;
  dayNumber: number;
  items: ItineraryItemRow[];
};

export type TripProjectionInput = {
  tripId: string;
  trip: {
    metadata?: unknown;
    pacingConfig?: unknown;
    destination?: string | null;
  };
  days: TripDayRow[];
};

function formatHm(d: Date | null, fallback?: string): string | undefined {
  if (!d) return fallback;
  return DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('HH:mm');
}

function durationMinutes(start: Date | null, end: Date | null): number | undefined {
  if (!start || !end) return undefined;
  const mins = DateTime.fromJSDate(end, { zone: 'utc' })
    .diff(DateTime.fromJSDate(start, { zone: 'utc' }), 'minutes').minutes;
  return Math.max(0, Math.round(mins));
}

function bookingToStatus(bookingStatus: string | null | undefined): PlanObject['status'] {
  const s = (bookingStatus ?? '').toUpperCase();
  if (s === 'BOOKED' || s === 'CONFIRMED' || s === 'COMPLETED') return 'CONFIRMED';
  if (s === 'TENTATIVE' || s === 'PENDING') return 'TENTATIVE';
  return 'PLANNED';
}

function toAccommodationRow(item: ItineraryItemRow, day: TripDayRow): AccommodationItemRow {
  return {
    id: item.id,
    type: item.type,
    tripDayId: day.id,
    tripDayDate: day.date,
    dayNumber: day.dayNumber,
    startTime: item.startTime,
    endTime: item.endTime,
    bookingStatus: item.bookingStatus,
    bookingConfirmation: null,
    bookingUrl: null,
    bookedAt: null,
    costCategory: item.costCategory,
    estimatedCost: null,
    actualCost: null,
    currency: null,
    note: item.note,
    placeId: item.placeId,
    placeNameCN: item.Place?.nameCN ?? null,
    placeNameEN: item.Place?.nameEN ?? null,
    placeCategory: item.Place?.category ?? null,
    placeAddress: item.Place?.address ?? null,
    placeRating: null,
    placeMetadata: null,
    travelFromPreviousDuration: item.travelFromPreviousDuration,
    travelFromPreviousDistance: item.travelFromPreviousDistance,
    travelMode: item.travelMode,
  };
}

function mapItemType(item: ItineraryItemRow, day: TripDayRow): PlanObjectType | null {
  const type = item.type.toUpperCase();
  if (isAccommodationItem(toAccommodationRow(item, day))) return 'STAY';
  if (type === 'TRANSIT') return 'TRANSFER';
  if (type === 'MEAL_ANCHOR') return 'DINING';
  if (type === 'MEAL_FLOATING') return 'MEAL_WINDOW';
  if (type === 'REST') return 'BUFFER';
  if (type === 'ACTIVITY') {
    const cat = item.Place?.category?.toUpperCase() ?? '';
    if (cat === 'ATTRACTION' || cat === 'VIEWPOINT' || cat === 'MUSEUM') return 'VISIT';
    return 'ACTIVITY';
  }
  return null;
}

function locationLabel(item: ItineraryItemRow): string | undefined {
  const cn = item.Place?.nameCN?.trim();
  const en = item.Place?.nameEN?.trim();
  if (cn || en) return cn ?? en ?? undefined;
  return item.note?.trim() || undefined;
}

function itemToPlanObject(
  item: ItineraryItemRow,
  day: TripDayRow,
  sequence: number,
  objectType: PlanObjectType,
): PlanObject {
  const isTransfer = objectType === 'TRANSFER';
  const transferDuration = item.travelFromPreviousDuration ?? undefined;
  const startWindow = formatHm(item.startTime);
  const endWindow = formatHm(item.endTime);
  const dur =
    durationMinutes(item.startTime, item.endTime) ??
    (isTransfer && transferDuration != null ? transferDuration : undefined);

  const physical = item.Place?.physicalMetadata as { fatigueScore?: number } | null | undefined;
  const fatigueScore =
    typeof physical?.fatigueScore === 'number' ? physical.fatigueScore : undefined;

  return {
    planObjectId: `po_${day.id}_${objectType.toLowerCase()}_${item.id}`,
    type: objectType,
    dayId: day.id,
    dayNumber: day.dayNumber,
    date: DateTime.fromJSDate(day.date, { zone: 'utc' }).toISODate() ?? '',
    sequence,
    startWindow,
    endWindow,
    durationMinutes: dur,
    locationMode: item.placeId != null ? 'FIXED_POI' : isTransfer ? 'ROUTE_CORRIDOR' : undefined,
    locationRef: item.placeId != null ? `place:${item.placeId}` : undefined,
    locationLabel: locationLabel(item),
    status: bookingToStatus(item.bookingStatus),
    sourceItineraryItemId: item.id,
    source: objectType === 'STAY' ? 'accommodation' : 'itinerary_item',
    metadata: {
      ...(isTransfer
        ? {
            travelMode: item.travelMode ?? undefined,
            travelFromPreviousDistance: item.travelFromPreviousDistance ?? undefined,
          }
        : {}),
      ...(fatigueScore != null ? { fatigueScore } : {}),
    },
  };
}

function hasExplicitMealObject(objects: PlanObject[]): boolean {
  return objects.some((o) => o.type === 'MEAL_WINDOW' || o.type === 'DINING' || o.type === 'SUPPLY_STOP');
}

export function readMealWindowDayShifts(metadata?: unknown): Record<number, number> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const raw = (metadata as Record<string, unknown>).mealWindowDayShifts;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const dayNum = Number(k);
    if (Number.isFinite(dayNum) && typeof v === 'number' && v !== 0) {
      out[dayNum] = v;
    }
  }
  return out;
}

function shiftHm(hm: string, minutes: number): string {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(normalized / 60);
  const nm = normalized % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function buildSyntheticMealWindow(
  day: TripDayRow,
  strategy: LunchStrategy,
  sequence: number,
  shiftMinutes = 0,
): PlanObject {
  const dateIso = DateTime.fromJSDate(day.date, { zone: 'utc' }).toISODate() ?? '';
  const block = buildMealBlockWindows(dateIso, strategy);
  const baseStart = block.start_window.split('T')[1]?.slice(0, 5) ?? '12:00';
  const baseEnd = block.end_window.split('T')[1]?.slice(0, 5) ?? '13:30';
  const startHm = shiftMinutes ? shiftHm(baseStart, shiftMinutes) : baseStart;
  const endHm = shiftMinutes ? shiftHm(baseEnd, shiftMinutes) : baseEnd;
  const [sh, sm] = startHm.split(':').map(Number);
  const [eh, em] = endHm.split(':').map(Number);
  const dur = eh * 60 + em - (sh * 60 + sm);

  return {
    planObjectId: `po_${day.id}_meal_window_policy`,
    type: 'MEAL_WINDOW',
    dayId: day.id,
    dayNumber: day.dayNumber,
    date: dateIso,
    sequence,
    startWindow: startHm,
    endWindow: endHm,
    durationMinutes: Math.max(dur, 0),
    locationMode: 'ROUTE_CORRIDOR',
    status: 'PLANNED',
    source: 'lunch_strategy',
    metadata: {
      lunchStrategy: strategy,
      mealAnchor: block.meal_anchor,
      label: block.label,
      ...(shiftMinutes ? { mealWindowShiftMinutes: shiftMinutes } : {}),
    },
  };
}

export function projectDayPlanObjects(
  day: TripDayRow,
  lunchStrategy: LunchStrategy,
  mealWindowDayShifts?: Record<number, number>,
): PlanObject[] {
  const objects: PlanObject[] = [];
  let sequence = 0;

  for (const item of day.items) {
    const objectType = mapItemType(item, day);
    if (!objectType) continue;
    sequence += 1;
    objects.push(itemToPlanObject(item, day, sequence, objectType));
  }

  if (!hasExplicitMealObject(objects)) {
    sequence += 1;
    const shiftMinutes = mealWindowDayShifts?.[day.dayNumber] ?? 0;
    objects.push(buildSyntheticMealWindow(day, lunchStrategy, sequence, shiftMinutes));
  }

  return objects.sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.planObjectId.localeCompare(b.planObjectId);
  });
}

export function projectTripPlanObjects(input: TripProjectionInput): PlanObjectProjectionView {
  const lunchStrategy = resolveLunchStrategyFromTrip(input.trip);
  const mealWindowDayShifts = readMealWindowDayShifts(input.trip.metadata);
  const days: PlanObjectDayProjection[] = input.days.map((day) => {
    const objects = projectDayPlanObjects(day, lunchStrategy, mealWindowDayShifts);
    const assessments = assessPlanObjectDay(objects, day.dayNumber, lunchStrategy);
    return {
      dayId: day.id,
      dayNumber: day.dayNumber,
      date: DateTime.fromJSDate(day.date, { zone: 'utc' }).toISODate() ?? '',
      objects,
      assessments,
    };
  });

  const byType: Partial<Record<PlanObjectType, number>> = {};
  let totalObjects = 0;
  let assessmentCount = 0;
  for (const day of days) {
    assessmentCount += day.assessments.length;
    for (const obj of day.objects) {
      totalObjects += 1;
      byType[obj.type] = (byType[obj.type] ?? 0) + 1;
    }
  }

  return {
    schemaId: 'tripnara.plan_object_projection@v1',
    tripId: input.tripId,
    generatedAt: new Date().toISOString(),
    lunchStrategy,
    days,
    summary: { totalObjects, byType, assessmentCount },
  };
}
