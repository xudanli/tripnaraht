/**
 * Derive same-day time-only updates for ITINERARY_ADJUST canary admission.
 * Full day replace / add / delete → not admitted (Legacy path).
 */

import { toIsoVisitWindows } from '../../../agent/utils/itinerary-adjust-corridor-apply.util';
import type { ItineraryCanaryTimeUpdate } from './itinerary-adjust-canary.admit';

export type TripItemForCanaryExtract = {
  id: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  placeId?: number | null;
  isPaid?: boolean;
  bookedAt?: Date | string | null;
  bookingStatus?: string | null;
  /** Soft lock: booking confirmation or explicit flag */
  locked?: boolean;
  bookingConfirmation?: string | null;
  productOfferingId?: string | null;
};

export type DraftItemForCanaryExtract = {
  id: string;
  start_window: string;
  end_window: string;
  location_ref?: { place_id?: string; name?: string };
};

export type SameDayTimeExtractResult =
  | {
      ok: true;
      operation: 'same_day_time_adjust';
      timeUpdates: ItineraryCanaryTimeUpdate[];
      itemFlags: Array<{
        itemId: string;
        isPaid?: boolean;
        bookedAt?: string | null;
        bookingStatus?: string | null;
        locked?: boolean;
      }>;
    }
  | { ok: false; reasonCodes: string[] };

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}

/**
 * Compare trip day items vs draft day items; admit only when IDs match 1:1
 * and the only changes are start/end times on the same calendar day.
 */
export function extractSameDayTimeUpdatesForCanary(input: {
  targetDateIso: string;
  tripDayDate?: Date | string | null;
  tripItems: readonly TripItemForCanaryExtract[];
  draftItems: readonly DraftItemForCanaryExtract[];
}): SameDayTimeExtractResult {
  const day = String(input.targetDateIso ?? '').slice(0, 10);
  const reasonCodes: string[] = [];
  if (!day) {
    return { ok: false, reasonCodes: ['MISSING_TARGET_DATE'] };
  }

  const tripById = new Map(input.tripItems.map((t) => [t.id, t]));
  const draftById = new Map(input.draftItems.map((d) => [d.id, d]));

  if (tripById.size === 0 || draftById.size === 0) {
    return { ok: false, reasonCodes: ['EMPTY_DAY_ITEMS'] };
  }
  if (tripById.size !== draftById.size) {
    return { ok: false, reasonCodes: ['ITEM_SET_MISMATCH_COUNT'] };
  }
  for (const id of tripById.keys()) {
    if (!draftById.has(id)) {
      reasonCodes.push(`TRIP_ITEM_MISSING_IN_DRAFT:${id}`);
    }
  }
  for (const id of draftById.keys()) {
    if (!tripById.has(id)) {
      reasonCodes.push(`DRAFT_ITEM_NOT_ON_TRIP:${id}`);
    }
  }
  if (reasonCodes.length) {
    return { ok: false, reasonCodes: ['NOT_TIME_ONLY_ADJUST', ...reasonCodes] };
  }

  const timeUpdates: ItineraryCanaryTimeUpdate[] = [];
  const itemFlags: Array<{
    itemId: string;
    isPaid?: boolean;
    bookedAt?: string | null;
    bookingStatus?: string | null;
    locked?: boolean;
  }> = [];

  for (const [id, tripItem] of tripById) {
    const draft = draftById.get(id)!;
    if (tripItem.productOfferingId) {
      reasonCodes.push(`EXTERNAL_PRODUCT_BINDING:${id}`);
    }
    const locked =
      Boolean(tripItem.locked) || Boolean(tripItem.bookingConfirmation);
    itemFlags.push({
      itemId: id,
      isPaid: tripItem.isPaid,
      bookedAt: tripItem.bookedAt
        ? toIso(tripItem.bookedAt)
        : null,
      bookingStatus: tripItem.bookingStatus ?? null,
      locked,
    });

    const windows = toIsoVisitWindows(
      input.tripDayDate ?? day,
      draft.start_window,
      draft.end_window,
    );
    if (!windows) {
      reasonCodes.push(`INVALID_DRAFT_WINDOW:${id}`);
      continue;
    }
    if (
      windows.startTime.slice(0, 10) !== day ||
      windows.endTime.slice(0, 10) !== day
    ) {
      reasonCodes.push(`NOT_SAME_DAY:${id}`);
      continue;
    }

    const curStart = toIso(tripItem.startTime);
    const curEnd = toIso(tripItem.endTime);
    const startChanged =
      !curStart ||
      new Date(curStart).getTime() !== new Date(windows.startTime).getTime();
    const endChanged =
      !curEnd ||
      new Date(curEnd).getTime() !== new Date(windows.endTime).getTime();
    if (startChanged || endChanged) {
      timeUpdates.push({
        itemId: id,
        startTimeIso: windows.startTime,
        endTimeIso: windows.endTime,
      });
    }
  }

  if (reasonCodes.length) {
    return { ok: false, reasonCodes };
  }
  if (!timeUpdates.length) {
    return { ok: false, reasonCodes: ['NO_TIME_CHANGES'] };
  }

  return {
    ok: true,
    operation: 'same_day_time_adjust',
    timeUpdates,
    itemFlags,
  };
}
