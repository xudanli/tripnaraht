import { DateTime } from 'luxon';
import type { PlanOperation } from '../../guardian-decision-core/contracts/plan-operation.types';
import {
  isFixedTimeAnchor,
  parseItineraryNoteConstraints,
  projectShiftTimeMaterialization,
  resolveShiftDeltaMinutes,
  resolveShiftMaterializationKind,
  resolveShiftPropagationMode,
  type ItineraryItemShiftProjection,
  type ShiftMaterializationResult,
} from './shift-time-materialization.util';

export interface DbItineraryItemRow {
  id: string;
  tripDayId: string;
  order?: number | null;
  startTime?: Date | null;
  endTime?: Date | null;
  note?: string | null;
  bookingStatus?: string | null;
  bookingConfirmation?: string | null;
  bookedAt?: Date | null;
  type?: string;
}

export interface TripDayRow {
  id: string;
  date: Date;
}

export function buildShiftProjections(
  items: DbItineraryItemRow[],
  tripDays: TripDayRow[],
): ItineraryItemShiftProjection[] {
  const dayBounds = new Map<string, { dayStartMs: number; dayEndMs: number }>();
  for (const day of tripDays) {
    const dt = DateTime.fromJSDate(day.date, { zone: 'utc' });
    dayBounds.set(day.id, {
      dayStartMs: dt.startOf('day').toMillis(),
      dayEndMs: dt.endOf('day').toMillis(),
    });
  }

  return items.map((item) => {
    const bounds = dayBounds.get(item.tripDayId) ?? {
      dayStartMs: 0,
      dayEndMs: Number.MAX_SAFE_INTEGER,
    };
    const noteConstraints = parseItineraryNoteConstraints(item.note, bounds.dayStartMs);
    return {
      id: item.id,
      tripDayId: item.tripDayId,
      order: item.order ?? 0,
      startTimeMs: item.startTime ? item.startTime.getTime() : null,
      endTimeMs: item.endTime ? item.endTime.getTime() : null,
      isFixedAnchor: isFixedTimeAnchor(item),
      dayStartMs: bounds.dayStartMs,
      dayEndMs: bounds.dayEndMs,
      bookedAtMs: item.bookedAt ? item.bookedAt.getTime() : null,
      bookingStatus: item.bookingStatus,
      bookingConfirmation: item.bookingConfirmation,
      note: item.note,
      ...noteConstraints,
    };
  });
}

export function planShiftOperationToMaterialization(input: {
  operation: PlanOperation;
  dayItems: DbItineraryItemRow[];
  tripDays: TripDayRow[];
}): ShiftMaterializationResult {
  const itemId =
    (input.operation.parameters.itineraryItemId as string | undefined) ??
    input.operation.targetRefs.find((r) => r.kind === 'PLAN_ITEM')?.id;

  if (!itemId) {
    return {
      updates: [],
      conflicts: [
        {
          itemId: 'unknown',
          reason: 'BOOKING_WINDOW_CONFLICT',
          message: 'SHIFT_TIME missing itineraryItemId',
        },
      ],
      blocked: true,
      blockReason: 'BOOKING_WINDOW_CONFLICT',
    };
  }

  const deltaMinutes = resolveShiftDeltaMinutes(input.operation.parameters);
  const propagation = resolveShiftPropagationMode(input.operation.parameters);
  const selectedItemIds = input.operation.parameters.selectedItemIds as string[] | undefined;
  const shiftKind = resolveShiftMaterializationKind(input.operation.parameters);

  const projections = buildShiftProjections(input.dayItems, input.tripDays);
  return projectShiftTimeMaterialization({
    items: projections,
    targetItemId: itemId,
    deltaMinutes,
    propagation,
    selectedItemIds,
    shiftKind,
  });
}
