import { DateTime } from 'luxon';
import type { ActivityType, ISODate, ISOTime } from '../../decision/world-model';
import type { PlanDay, PlanSlot, TripPlan } from '../../decision/plan-model';

export interface TripPlanPersistenceResult {
  applied: boolean;
  updatedItemIds: string[];
  createdItemIds: string[];
  removedItemIds: string[];
  skippedLockedItemIds: string[];
}

export interface TripDayRecord {
  id: string;
  date: Date;
}

export interface ItineraryItemRecord {
  id: string;
  tripDayId: string;
  type: string;
  placeId: number | null;
}

export function mapPlanSlotTypeToItemType(slotType: ActivityType): string {
  switch (slotType) {
    case 'transport':
      return 'TRANSIT';
    case 'food':
      return 'MEAL_FLOATING';
    case 'rest':
    case 'hotel':
      return 'REST';
    default:
      return 'ACTIVITY';
  }
}

export function combineDateAndTime(date: ISODate, time: ISOTime): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: 'utc' }).toJSDate();
}

export function resolveSlotTimes(planDay: PlanDay, slot: PlanSlot): { startTime: Date; endTime: Date } {
  const startTime = combineDateAndTime(planDay.date, slot.time);
  const endTime = slot.endTime
    ? combineDateAndTime(planDay.date, slot.endTime)
    : DateTime.fromJSDate(startTime).plus({ hours: 2 }).toJSDate();
  return { startTime, endTime };
}

export function findTripDayIdForPlanDay(
  planDay: PlanDay,
  tripDays: TripDayRecord[],
): string | undefined {
  const byDate = tripDays.find(
    (day) => DateTime.fromJSDate(day.date).toISODate() === planDay.date,
  );
  if (byDate) return byDate.id;

  const byIndex = tripDays[planDay.day - 1];
  return byIndex?.id;
}

export function buildTripPlanPersistenceOps(input: {
  plan: TripPlan;
  tripDays: TripDayRecord[];
  existingItems: ItineraryItemRecord[];
  lockedSlotIds?: Set<string>;
}): {
  updates: Array<{
    id: string;
    tripDayId: string;
    startTime: Date;
    endTime: Date;
    order: number;
    placeId: number | null;
    type: string;
  }>;
  creates: Array<{
    id: string;
    tripDayId: string;
    startTime: Date;
    endTime: Date;
    order: number;
    placeId: number | null;
    type: string;
  }>;
  deletes: string[];
  skippedLockedItemIds: string[];
} {
  const existingById = new Map(input.existingItems.map((item) => [item.id, item]));
  const locked = input.lockedSlotIds ?? new Set<string>();
  const allPlanSlotIds = new Set(
    input.plan.days.flatMap((day) => day.timeSlots.map((slot) => slot.id)),
  );
  const updates: Array<{
    id: string;
    tripDayId: string;
    startTime: Date;
    endTime: Date;
    order: number;
    placeId: number | null;
    type: string;
  }> = [];
  const creates: Array<{
    id: string;
    tripDayId: string;
    startTime: Date;
    endTime: Date;
    order: number;
    placeId: number | null;
    type: string;
  }> = [];
  const deletes: string[] = [];
  const skippedLockedItemIds: string[] = [];
  const retainedIds = new Set<string>();

  for (const planDay of input.plan.days) {
    const tripDayId = findTripDayIdForPlanDay(planDay, input.tripDays);
    if (!tripDayId) continue;

    const daySlotIds = new Set(planDay.timeSlots.map((slot) => slot.id));

    for (const item of input.existingItems) {
      if (item.tripDayId !== tripDayId) continue;
      if (daySlotIds.has(item.id)) continue;
      // Still on another plan day → cross-day move; persist via update, not delete+recreate.
      if (allPlanSlotIds.has(item.id)) continue;
      if (locked.has(item.id)) {
        skippedLockedItemIds.push(item.id);
        retainedIds.add(item.id);
        continue;
      }
      if (item.type === 'ACTIVITY' || item.type === 'REST' || item.type === 'MEAL_FLOATING') {
        deletes.push(item.id);
      }
    }

    planDay.timeSlots.forEach((slot, index) => {
      if (locked.has(slot.id)) {
        skippedLockedItemIds.push(slot.id);
        retainedIds.add(slot.id);
        return;
      }

      const { startTime, endTime } = resolveSlotTimes(planDay, slot);
      const placeId = slot.poiId && /^\d+$/.test(slot.poiId) ? Number(slot.poiId) : null;
      const type = mapPlanSlotTypeToItemType(slot.type);
      const payload = {
        id: slot.id,
        tripDayId,
        startTime,
        endTime,
        order: index + 1,
        placeId,
        type,
      };

      if (existingById.has(slot.id)) {
        updates.push(payload);
        retainedIds.add(slot.id);
      } else if (placeId || slot.title) {
        creates.push(payload);
        retainedIds.add(slot.id);
      }
    });
  }

  return { updates, creates, deletes, skippedLockedItemIds };
}

export function summarizePersistenceResult(input: {
  updates: unknown[];
  creates: unknown[];
  deletes: string[];
  skippedLockedItemIds: string[];
}): TripPlanPersistenceResult {
  return {
    applied: input.updates.length + input.creates.length + input.deletes.length > 0,
    updatedItemIds: input.updates.map((item: any) => item.id),
    createdItemIds: input.creates.map((item: any) => item.id),
    removedItemIds: input.deletes,
    skippedLockedItemIds: input.skippedLockedItemIds,
  };
}
