import type { ItineraryItemShiftProjection, ShiftTimeUpdate } from './shift-time-materialization.util';

export interface BookingAwareShiftProjection extends ItineraryItemShiftProjection {
  bookedAtMs?: number | null;
  bookingStatus?: string | null;
  bookingConfirmation?: string | null;
  note?: string | null;
}

export function hasBookedItineraryItem(item: BookingAwareShiftProjection): boolean {
  const status = String(item.bookingStatus ?? '').trim().toUpperCase();
  if (status && status !== 'NONE' && status !== 'PENDING') return true;
  if (item.bookingConfirmation?.trim()) return true;
  if (item.bookedAtMs != null) return true;
  return /\[(booking-ref|slot):/i.test(String(item.note ?? ''));
}

export function appendBookingRescheduleConfirmation(
  existing: string | null | undefined,
  newStartTimeMs: number,
): string {
  const stamp = new Date(newStartTimeMs).toISOString();
  const line = `[ERC rescheduled ${stamp}]`;
  const base = String(existing ?? '').trim();
  return base ? `${base} ${line}` : line;
}

export function updateNoteSlotTag(note: string, newStartTimeMs: number | null): string {
  if (newStartTimeMs === null) return note;
  const dt = new Date(newStartTimeMs);
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mm = String(dt.getUTCMinutes()).padStart(2, '0');
  const slot = `${hh}:${mm}`;
  if (/\[slot:\d{1,2}:\d{2}\]/i.test(note)) {
    return note.replace(/\[slot:\d{1,2}:\d{2}\]/i, `[slot:${slot}]`);
  }
  return note;
}

/** Derive booking field writes when a booked item's schedule shifts. */
export function projectBookingFieldUpdates(
  item: BookingAwareShiftProjection,
  shifted: { startTimeMs: number | null; endTimeMs: number | null },
): Pick<ShiftTimeUpdate, 'bookedAtMs' | 'bookingStatus' | 'bookingConfirmation' | 'note'> {
  if (!hasBookedItineraryItem(item)) return {};
  if (shifted.startTimeMs === null && shifted.endTimeMs === null) return {};

  const patch: Pick<
    ShiftTimeUpdate,
    'bookedAtMs' | 'bookingStatus' | 'bookingConfirmation' | 'note'
  > = {};

  const originalStart = item.startTimeMs;
  const moved =
    shifted.startTimeMs !== null &&
    originalStart !== null &&
    shifted.startTimeMs !== originalStart;

  if (!moved) return patch;

  if (
    item.bookedAtMs != null &&
    originalStart != null &&
    item.bookedAtMs === originalStart &&
    shifted.startTimeMs !== null
  ) {
    patch.bookedAtMs = shifted.startTimeMs;
  }

  if (shifted.startTimeMs !== null) {
    patch.bookingConfirmation = appendBookingRescheduleConfirmation(
      item.bookingConfirmation,
      shifted.startTimeMs,
    );
  }

  if (item.note) {
    const nextNote = updateNoteSlotTag(item.note, shifted.startTimeMs);
    if (nextNote !== item.note) patch.note = nextNote;
  }

  const status = String(item.bookingStatus ?? '').toUpperCase();
  if (
    status === 'CONFIRMED' ||
    status === 'NON_REFUNDABLE' ||
    status === 'COMPLETED_OVERRUNNING'
  ) {
    patch.bookingStatus = 'VERIFY_REQUIRED';
  }

  return patch;
}

export function mergeShiftUpdateWithBookingFields(
  update: ShiftTimeUpdate,
  item: BookingAwareShiftProjection,
): ShiftTimeUpdate {
  const bookingPatch = projectBookingFieldUpdates(item, {
    startTimeMs: update.startTimeMs,
    endTimeMs: update.endTimeMs,
  });
  return { ...update, ...bookingPatch };
}
