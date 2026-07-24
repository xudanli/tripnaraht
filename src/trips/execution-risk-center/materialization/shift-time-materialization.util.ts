import { mergeShiftUpdateWithBookingFields } from './booking-field-materialization.util';

export type ShiftPropagationMode =
  | 'TARGET_ONLY'
  | 'UNTIL_FIXED_ANCHOR'
  | 'REST_OF_DAY'
  | 'SELECTED_ITEMS';

export type MaterializationBlockReason =
  | 'CROSS_DAY'
  | 'FIXED_ANCHOR_CONFLICT'
  | 'MIN_DURATION_VIOLATION'
  | 'OPENING_HOURS_VIOLATION'
  | 'BOOKING_WINDOW_CONFLICT';

export interface ItineraryItemShiftProjection {
  id: string;
  tripDayId: string;
  order: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  isFixedAnchor: boolean;
  minDurationMinutes?: number;
  dayStartMs: number;
  dayEndMs: number;
  /** Venue opening window (absolute ms). */
  openingHoursStartMs?: number;
  openingHoursEndMs?: number;
  /** Latest allowed arrival / check-in for booked items (absolute ms). */
  bookingLatestArrivalMs?: number;
  bookedAtMs?: number | null;
  bookingStatus?: string | null;
  bookingConfirmation?: string | null;
  note?: string | null;
}

export interface ShiftTimeUpdate {
  itemId: string;
  startTimeMs: number | null;
  endTimeMs: number | null;
  /** Recalculated gap from previous item after cascade (minutes). */
  travelFromPreviousDurationMinutes?: number;
  bookedAtMs?: number | null;
  bookingStatus?: string;
  bookingConfirmation?: string;
  note?: string;
}

export interface MaterializationConflict {
  itemId: string;
  reason: MaterializationBlockReason;
  message: string;
}

export interface ShiftMaterializationResult {
  updates: ShiftTimeUpdate[];
  conflicts: MaterializationConflict[];
  blocked: boolean;
  blockReason?: MaterializationBlockReason;
}

const MS_PER_MINUTE = 60_000;

export function resolveShiftDeltaMinutes(parameters: Record<string, unknown>): number {
  const explicit = parameters.timeDeltaMinutes;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;

  const after = parameters.after as { durationMinutes?: number } | undefined;
  const before = parameters.before as { durationMinutes?: number } | undefined;
  if (
    typeof after?.durationMinutes === 'number' &&
    typeof before?.durationMinutes === 'number'
  ) {
    return after.durationMinutes - before.durationMinutes;
  }

  const shiftMinutes = parameters.shiftMinutes;
  if (typeof shiftMinutes === 'number' && Number.isFinite(shiftMinutes)) return shiftMinutes;

  return 0;
}

export function resolveShiftPropagationMode(
  parameters: Record<string, unknown>,
): ShiftPropagationMode {
  const mode = parameters.propagationMode;
  if (
    mode === 'TARGET_ONLY' ||
    mode === 'UNTIL_FIXED_ANCHOR' ||
    mode === 'REST_OF_DAY' ||
    mode === 'SELECTED_ITEMS'
  ) {
    return mode;
  }
  if (parameters.restOfDay === true) return 'REST_OF_DAY';
  return 'UNTIL_FIXED_ANCHOR';
}

export type ShiftMaterializationKind = 'TRANSLATE' | 'COMPRESS_END';

export function resolveShiftMaterializationKind(
  parameters: Record<string, unknown>,
): ShiftMaterializationKind {
  if (parameters.shiftKind === 'COMPRESS_END') return 'COMPRESS_END';
  const before = parameters.before as { durationMinutes?: number } | undefined;
  const after = parameters.after as { durationMinutes?: number } | undefined;
  const explicitDelta = parameters.timeDeltaMinutes;
  if (
    typeof before?.durationMinutes === 'number' &&
    typeof after?.durationMinutes === 'number' &&
    after.durationMinutes < before.durationMinutes &&
    (explicitDelta === 0 || explicitDelta === undefined)
  ) {
    return 'COMPRESS_END';
  }
  return 'TRANSLATE';
}

/** Parse `[opening:09:00-17:00]` and `[latest-arrival:13:45]` tags from itinerary note. */
export function parseItineraryNoteConstraints(
  note: string | null | undefined,
  dayStartMs: number,
): {
  openingHoursStartMs?: number;
  openingHoursEndMs?: number;
  bookingLatestArrivalMs?: number;
} {
  const text = String(note ?? '');
  const result: {
    openingHoursStartMs?: number;
    openingHoursEndMs?: number;
    bookingLatestArrivalMs?: number;
  } = {};

  const opening = text.match(/\[opening:(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\]/i);
  if (opening) {
    result.openingHoursStartMs =
      dayStartMs +
      (Number(opening[1]) * 60 + Number(opening[2])) * MS_PER_MINUTE;
    result.openingHoursEndMs =
      dayStartMs +
      (Number(opening[3]) * 60 + Number(opening[4])) * MS_PER_MINUTE;
  }

  const latest =
    text.match(/\[latest-arrival:(\d{1,2}):(\d{2})\]/i) ??
    text.match(/\[booking-latest:(\d{1,2}):(\d{2})\]/i);
  if (latest) {
    result.bookingLatestArrivalMs =
      dayStartMs +
      (Number(latest[1]) * 60 + Number(latest[2])) * MS_PER_MINUTE;
  }

  return result;
}

export function isFixedTimeAnchor(item: {
  isFixedAnchor?: boolean;
  bookingStatus?: string | null;
  note?: string | null;
  type?: string;
}): boolean {
  if (item.isFixedAnchor) return true;
  const note = String(item.note ?? '').toLowerCase();
  if (note.includes('[fixed-anchor]') || note.includes('[不可调整]')) return true;
  const status = String(item.bookingStatus ?? '').toUpperCase();
  if (status === 'CONFIRMED' || status === 'NON_REFUNDABLE') return true;
  const type = String(item.type ?? '').toUpperCase();
  return type === 'FLIGHT' || type === 'FERRY' || type === 'GUIDE_MEETUP';
}

export function projectShiftTimeMaterialization(input: {
  items: ItineraryItemShiftProjection[];
  targetItemId: string;
  deltaMinutes: number;
  propagation: ShiftPropagationMode;
  selectedItemIds?: string[];
  shiftKind?: ShiftMaterializationKind;
}): ShiftMaterializationResult {
  const sorted = [...input.items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const targetIdx = sorted.findIndex((i) => i.id === input.targetItemId);
  if (targetIdx < 0) {
    return {
      updates: [],
      conflicts: [
        {
          itemId: input.targetItemId,
          reason: 'BOOKING_WINDOW_CONFLICT',
          message: `Target item ${input.targetItemId} not found`,
        },
      ],
      blocked: true,
      blockReason: 'BOOKING_WINDOW_CONFLICT',
    };
  }

  if (input.deltaMinutes === 0 && input.shiftKind !== 'COMPRESS_END') {
    return { updates: [], conflicts: [], blocked: false };
  }

  const targetIds = resolvePropagationTargets(sorted, targetIdx, input);
  const updates: ShiftTimeUpdate[] = [];
  const conflicts: MaterializationConflict[] = [];

  for (const itemId of targetIds) {
    const item = sorted.find((i) => i.id === itemId)!;
    const shifted =
      input.shiftKind === 'COMPRESS_END' && itemId === input.targetItemId
        ? compressItemEndTime(item, input.deltaMinutes)
        : shiftItemTimes(item, input.deltaMinutes);

    const constraintViolation = detectConstraintViolation(item, shifted);
    if (constraintViolation) {
      return {
        updates: [],
        conflicts: [constraintViolation],
        blocked: true,
        blockReason: constraintViolation.reason,
      };
    }

    if (shifted.crossDay) {
      return {
        updates: [],
        conflicts: [
          {
            itemId: item.id,
            reason: 'CROSS_DAY',
            message: `Shift of ${input.deltaMinutes}min would cross day boundary for ${item.id}`,
          },
        ],
        blocked: true,
        blockReason: 'CROSS_DAY',
      };
    }

    if (shifted.minDurationViolation) {
      return {
        updates: [],
        conflicts: [
          {
            itemId: item.id,
            reason: 'MIN_DURATION_VIOLATION',
            message: `Shift violates minimum duration for ${item.id}`,
          },
        ],
        blocked: true,
        blockReason: 'MIN_DURATION_VIOLATION',
      };
    }

    if (item.isFixedAnchor && itemId !== input.targetItemId) {
      conflicts.push({
        itemId: item.id,
        reason: 'FIXED_ANCHOR_CONFLICT',
        message: `Propagation stopped at fixed anchor ${item.id}`,
      });
      break;
    }

    updates.push(
      mergeShiftUpdateWithBookingFields(
        {
          itemId: item.id,
          startTimeMs: shifted.startTimeMs,
          endTimeMs: shifted.endTimeMs,
        },
        item,
      ),
    );
  }

  if (
    input.propagation === 'UNTIL_FIXED_ANCHOR' &&
    conflicts.length === 0 &&
    targetIdx + updates.length < sorted.length
  ) {
    const next = sorted[targetIdx + updates.length];
    if (next?.isFixedAnchor) {
      conflicts.push({
        itemId: next.id,
        reason: 'FIXED_ANCHOR_CONFLICT',
        message: `Subsequent items blocked by fixed anchor ${next.id}`,
      });
    }
  }

  const cascadedUpdates = projectTransportCascadeUpdates(sorted, updates);
  return { updates: cascadedUpdates, conflicts, blocked: false };
}

/** Recompute travelFromPreviousDuration for items whose start times moved. */
export function projectTransportCascadeUpdates(
  items: ItineraryItemShiftProjection[],
  timeUpdates: ShiftTimeUpdate[],
): ShiftTimeUpdate[] {
  if (timeUpdates.length === 0) return timeUpdates;

  const updatedIds = new Set(timeUpdates.map((u) => u.itemId));
  const sorted = [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(timeUpdates.map((u) => [u.itemId, { ...u }]));

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (!updatedIds.has(curr.id)) continue;

    const prevUpdate = byId.get(prev.id);
    const currUpdate = byId.get(curr.id)!;

    const prevEndMs = prevUpdate?.endTimeMs ?? prev.endTimeMs;
    const currStartMs = currUpdate.startTimeMs ?? curr.startTimeMs;
    if (prevEndMs === null || currStartMs === null) continue;

    const travelMinutes = Math.max(0, Math.round((currStartMs - prevEndMs) / MS_PER_MINUTE));
    currUpdate.travelFromPreviousDurationMinutes = travelMinutes;
  }

  return [...byId.values()];
}

function detectConstraintViolation(
  item: ItineraryItemShiftProjection,
  shifted: {
    startTimeMs: number | null;
    endTimeMs: number | null;
  },
): MaterializationConflict | null {
  if (
    item.bookingLatestArrivalMs !== undefined &&
    shifted.startTimeMs !== null &&
    shifted.startTimeMs > item.bookingLatestArrivalMs
  ) {
    return {
      itemId: item.id,
      reason: 'BOOKING_WINDOW_CONFLICT',
      message: `Shifted start exceeds booking latest arrival for ${item.id}`,
    };
  }

  if (
    item.openingHoursStartMs !== undefined &&
    shifted.startTimeMs !== null &&
    shifted.startTimeMs < item.openingHoursStartMs
  ) {
    return {
      itemId: item.id,
      reason: 'OPENING_HOURS_VIOLATION',
      message: `Shifted start before opening hours for ${item.id}`,
    };
  }

  if (
    item.openingHoursEndMs !== undefined &&
    shifted.endTimeMs !== null &&
    shifted.endTimeMs > item.openingHoursEndMs
  ) {
    return {
      itemId: item.id,
      reason: 'OPENING_HOURS_VIOLATION',
      message: `Shifted end after closing hours for ${item.id}`,
    };
  }

  return null;
}

function compressItemEndTime(
  item: ItineraryItemShiftProjection,
  deltaMinutes: number,
): {
  startTimeMs: number | null;
  endTimeMs: number | null;
  crossDay: boolean;
  minDurationViolation: boolean;
} {
  const deltaMs = deltaMinutes * MS_PER_MINUTE;
  const startTimeMs = item.startTimeMs;
  const endTimeMs =
    item.endTimeMs === null ? null : item.endTimeMs + deltaMs;

  const crossDay =
    (startTimeMs !== null && (startTimeMs < item.dayStartMs || startTimeMs >= item.dayEndMs)) ||
    (endTimeMs !== null && (endTimeMs < item.dayStartMs || endTimeMs >= item.dayEndMs));

  let minDurationViolation = false;
  if (
    startTimeMs !== null &&
    endTimeMs !== null &&
    item.minDurationMinutes !== undefined &&
    endTimeMs - startTimeMs < item.minDurationMinutes * MS_PER_MINUTE
  ) {
    minDurationViolation = true;
  }

  return { startTimeMs, endTimeMs, crossDay, minDurationViolation };
}

function resolvePropagationTargets(
  sorted: ItineraryItemShiftProjection[],
  targetIdx: number,
  input: {
    targetItemId: string;
    propagation: ShiftPropagationMode;
    selectedItemIds?: string[];
  },
): string[] {
  switch (input.propagation) {
    case 'TARGET_ONLY':
      return [input.targetItemId];
    case 'SELECTED_ITEMS':
      return input.selectedItemIds?.length
        ? input.selectedItemIds
        : [input.targetItemId];
    case 'REST_OF_DAY':
      return sorted.slice(targetIdx).filter((i) => !i.isFixedAnchor).map((i) => i.id);
    case 'UNTIL_FIXED_ANCHOR':
    default: {
      const ids: string[] = [];
      for (let i = targetIdx; i < sorted.length; i++) {
        const item = sorted[i]!;
        if (i > targetIdx && item.isFixedAnchor) break;
        ids.push(item.id);
      }
      return ids;
    }
  }
}

function shiftItemTimes(
  item: ItineraryItemShiftProjection,
  deltaMinutes: number,
): {
  startTimeMs: number | null;
  endTimeMs: number | null;
  crossDay: boolean;
  minDurationViolation: boolean;
} {
  const deltaMs = deltaMinutes * MS_PER_MINUTE;
  const startTimeMs =
    item.startTimeMs === null ? null : item.startTimeMs + deltaMs;
  const endTimeMs = item.endTimeMs === null ? null : item.endTimeMs + deltaMs;

  const crossDay =
    (startTimeMs !== null && (startTimeMs < item.dayStartMs || startTimeMs >= item.dayEndMs)) ||
    (endTimeMs !== null && (endTimeMs < item.dayStartMs || endTimeMs >= item.dayEndMs));

  let minDurationViolation = false;
  if (
    startTimeMs !== null &&
    endTimeMs !== null &&
    item.minDurationMinutes !== undefined &&
    endTimeMs - startTimeMs < item.minDurationMinutes * MS_PER_MINUTE
  ) {
    minDurationViolation = true;
  }

  return { startTimeMs, endTimeMs, crossDay, minDurationViolation };
}
