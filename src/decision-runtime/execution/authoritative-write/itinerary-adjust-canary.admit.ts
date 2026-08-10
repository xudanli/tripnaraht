/**
 * ITINERARY_ADJUST canary admission — same-day time, ADD, from-candidates, REMOVE, REORDER, MOVE+ADD.
 * WriteTargets: Trip + ItineraryItem (+ candidate pool delete for from-candidates).
 * No booking/lock/external SE. Pure families XOR; MOVE+ADD is the only composite family.
 */

import {
  getItineraryAdjustCanaryOperationAllowlist,
  getItineraryAdjustCanaryTripAllowlist,
} from './itinerary-adjust-canary.config';

export type ItineraryCanaryTimeUpdate = {
  itemId: string;
  startTimeIso: string;
  endTimeIso: string;
};

/** Same-day ADD — create unbooked ItineraryItem (Arrange ADD / ADD_ITEM). */
export type ItineraryCanaryItemCreate = {
  tripDayId: string;
  placeId?: number | null;
  type?: string;
  startTimeIso: string;
  endTimeIso: string;
  note?: string | null;
  /** Stable client key for audit; not used as DB id. */
  clientItemKey?: string;
};

/** Same-day REORDER — update ItineraryItem.order only (no time rewrite). */
export type ItineraryCanaryItemReorder = {
  itemId: string;
  order: number;
};

export type ItineraryAdjustCanaryAdmissionInput = {
  tripId: string;
  operation: string;
  targetDateIso: string;
  /** Must be replace_day / time-only — append_sparse_days rejected */
  applyMode?: string;
  timeUpdates?: readonly ItineraryCanaryTimeUpdate[];
  itemCreates?: readonly ItineraryCanaryItemCreate[];
  /** Explore-candidate ids to delete (AUTO_ARRANGE / FILL_GAP). */
  candidateRemovals?: readonly string[];
  /** Same-day REMOVE — itinerary item ids to delete. */
  itemRemovals?: readonly string[];
  /** Same-day REORDER — { itemId, order } pairs. */
  itemReorders?: readonly ItineraryCanaryItemReorder[];
  /** Item flags from DB or draft */
  itemFlags?: ReadonlyArray<{
    itemId: string;
    isPaid?: boolean;
    bookedAt?: string | null;
    bookingStatus?: string | null;
    locked?: boolean;
  }>;
};

export type ItineraryAdjustCanaryAdmissionResult = {
  admitted: boolean;
  reasonCodes: string[];
  writeTargets: ReadonlyArray<'Trip' | 'ItineraryItem'>;
};

function hasOtherThan(flags: boolean[]): boolean {
  return flags.some(Boolean);
}

export function admitItineraryAdjustCanaryRequest(
  input: ItineraryAdjustCanaryAdmissionInput,
  env: NodeJS.ProcessEnv = process.env,
): ItineraryAdjustCanaryAdmissionResult {
  const reasonCodes: string[] = [];
  const trips = new Set(getItineraryAdjustCanaryTripAllowlist(env));
  const ops = new Set(
    getItineraryAdjustCanaryOperationAllowlist(env).map((o) => o.toLowerCase()),
  );

  if (!trips.has(input.tripId)) {
    reasonCodes.push(`TRIP_NOT_IN_ALLOWLIST:${input.tripId}`);
  }
  if (!ops.has(String(input.operation).toLowerCase())) {
    reasonCodes.push(`OP_NOT_IN_ALLOWLIST:${input.operation}`);
  }
  if (input.applyMode === 'append_sparse_days') {
    reasonCodes.push('APPEND_SPARSE_DAYS_FORBIDDEN');
  }

  const op = String(input.operation).toLowerCase();
  const isAdd = op === 'same_day_add_item';
  const isFromCandidates = op === 'same_day_add_from_candidates';
  const isMultiDayFromCandidates = op === 'multi_day_add_from_candidates';
  const isRemove = op === 'same_day_remove_item';
  const isReorder = op === 'same_day_reorder_items';
  const isMoveAndAdd = op === 'same_day_move_and_add';
  const isReduceIntensity = op === 'same_day_reduce_intensity';
  const timeUpdates = input.timeUpdates ?? [];
  const itemCreates = input.itemCreates ?? [];
  const candidateRemovals = (input.candidateRemovals ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const itemRemovals = (input.itemRemovals ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const itemReorders = (input.itemReorders ?? []).filter(
    (r) => r && String(r.itemId ?? '').trim(),
  );

  const mixedReorder = () => {
    if (itemReorders.length) reasonCodes.push('MIXED_REORDER_WITH_OTHER_MUTATIONS');
  };
  const mixedRemove = () => {
    if (itemRemovals.length) reasonCodes.push('MIXED_REMOVE_WITH_OTHER_MUTATIONS');
  };

  if (isReduceIntensity || isMoveAndAdd) {
    if (!timeUpdates.length) reasonCodes.push('NO_TIME_UPDATES');
    if (!itemCreates.length) reasonCodes.push('NO_ITEM_CREATES');
    if (
      hasOtherThan([
        candidateRemovals.length > 0,
        itemRemovals.length > 0,
        itemReorders.length > 0,
      ])
    ) {
      reasonCodes.push(
        isReduceIntensity
          ? 'MIXED_REDUCE_INTENSITY_WITH_OTHER_MUTATIONS'
          : 'MIXED_MOVE_AND_ADD_WITH_OTHER_MUTATIONS',
      );
    }
    if (isReduceIntensity) {
      for (const c of itemCreates) {
        const t = String(c.type ?? '').toUpperCase();
        if (t && t !== 'REST') {
          reasonCodes.push(`REDUCE_INTENSITY_REQUIRES_REST_CREATE:${c.clientItemKey || c.tripDayId}`);
        }
        if (c.placeId != null && Number.isFinite(Number(c.placeId))) {
          reasonCodes.push(
            `REDUCE_INTENSITY_REST_MUST_NOT_HAVE_PLACE:${c.clientItemKey || c.tripDayId}`,
          );
        }
      }
    }
  } else if (isReorder) {
    if (!itemReorders.length) reasonCodes.push('NO_ITEM_REORDERS');
    if (
      hasOtherThan([
        timeUpdates.length > 0,
        itemCreates.length > 0,
        candidateRemovals.length > 0,
        itemRemovals.length > 0,
      ])
    ) {
      reasonCodes.push('MIXED_REORDER_WITH_OTHER_MUTATIONS');
    }
  } else if (isRemove) {
    if (!itemRemovals.length) reasonCodes.push('NO_ITEM_REMOVALS');
    if (
      hasOtherThan([
        timeUpdates.length > 0,
        itemCreates.length > 0,
        candidateRemovals.length > 0,
        itemReorders.length > 0,
      ])
    ) {
      reasonCodes.push('MIXED_REMOVE_WITH_OTHER_MUTATIONS');
    }
  } else if (isFromCandidates || isMultiDayFromCandidates) {
    if (!itemCreates.length) reasonCodes.push('NO_ITEM_CREATES');
    if (!candidateRemovals.length) reasonCodes.push('NO_CANDIDATE_REMOVALS');
    if (timeUpdates.length) reasonCodes.push('MIXED_TIME_UPDATE_AND_ITEM_CREATES');
    mixedRemove();
    mixedReorder();
    if (isMultiDayFromCandidates) {
      const dayIds = new Set(
        itemCreates.map((c) => String(c.tripDayId ?? '').trim()).filter(Boolean),
      );
      if (dayIds.size < 2) {
        reasonCodes.push('MULTI_DAY_REQUIRES_MULTIPLE_TRIP_DAYS');
      }
    }
  } else if (isAdd) {
    if (!itemCreates.length) reasonCodes.push('NO_ITEM_CREATES');
    if (timeUpdates.length) reasonCodes.push('MIXED_TIME_UPDATE_AND_ITEM_CREATES');
    if (candidateRemovals.length) {
      reasonCodes.push('CANDIDATE_REMOVALS_REQUIRE_FROM_CANDIDATES_OP');
    }
    mixedRemove();
    mixedReorder();
  } else {
    if (!timeUpdates.length) reasonCodes.push('NO_TIME_UPDATES');
    if (itemCreates.length) reasonCodes.push('MIXED_TIME_UPDATE_AND_ITEM_CREATES');
    if (candidateRemovals.length) {
      reasonCodes.push('CANDIDATE_REMOVALS_REQUIRE_FROM_CANDIDATES_OP');
    }
    mixedRemove();
    mixedReorder();
  }

  const day = String(input.targetDateIso ?? '').slice(0, 10);
  for (const u of timeUpdates) {
    if (!u.itemId || !u.startTimeIso || !u.endTimeIso) {
      reasonCodes.push(`INVALID_TIME_UPDATE:${u.itemId || 'unknown'}`);
      continue;
    }
    const s = u.startTimeIso.slice(0, 10);
    const e = u.endTimeIso.slice(0, 10);
    if (day && (s !== day || e !== day)) {
      reasonCodes.push(`NOT_SAME_DAY:${u.itemId}`);
    }
  }

  for (const c of itemCreates) {
    if (!c.tripDayId || !c.startTimeIso || !c.endTimeIso) {
      reasonCodes.push(`INVALID_ITEM_CREATE:${c.clientItemKey || c.tripDayId || 'unknown'}`);
      continue;
    }
    const s = c.startTimeIso.slice(0, 10);
    const e = c.endTimeIso.slice(0, 10);
    if (s !== e) {
      reasonCodes.push(`CREATE_WINDOW_SPANS_DAYS:${c.clientItemKey || c.tripDayId}`);
      continue;
    }
    // Same-day / pure ADD: enforce targetDateIso. Multi-day from-candidates spans days.
    if (!isMultiDayFromCandidates && day && (s !== day || e !== day)) {
      reasonCodes.push(`NOT_SAME_DAY_CREATE:${c.clientItemKey || c.tripDayId}`);
    }
  }

  for (const id of itemRemovals) {
    if (!id) reasonCodes.push('INVALID_ITEM_REMOVAL');
  }

  const seenReorderIds = new Set<string>();
  for (const r of itemReorders) {
    const id = String(r.itemId ?? '').trim();
    if (!id) {
      reasonCodes.push('INVALID_ITEM_REORDER');
      continue;
    }
    if (seenReorderIds.has(id)) {
      reasonCodes.push(`DUPLICATE_ITEM_REORDER:${id}`);
      continue;
    }
    seenReorderIds.add(id);
    if (!Number.isFinite(r.order) || r.order < 0 || !Number.isInteger(r.order)) {
      reasonCodes.push(`INVALID_ITEM_REORDER_ORDER:${id}`);
    }
  }

  for (const f of input.itemFlags ?? []) {
    if (f.isPaid) reasonCodes.push(`ITEM_PAID:${f.itemId}`);
    if (f.bookedAt) reasonCodes.push(`ITEM_BOOKED:${f.itemId}`);
    if (f.locked) reasonCodes.push(`ITEM_LOCKED:${f.itemId}`);
    const bs = String(f.bookingStatus ?? '').toUpperCase();
    if (bs && bs !== 'NONE' && bs !== 'UNBOOKED' && bs !== 'DRAFT') {
      reasonCodes.push(`ITEM_BOOKING_STATUS:${f.itemId}:${bs}`);
    }
  }

  const blocking = reasonCodes.filter(
    (c) =>
      c.startsWith('TRIP_NOT_IN_ALLOWLIST') ||
      c.startsWith('OP_NOT_IN_ALLOWLIST') ||
      c.startsWith('APPEND_') ||
      c.startsWith('NO_TIME') ||
      c.startsWith('NO_ITEM') ||
      c.startsWith('NO_CANDIDATE') ||
      c.startsWith('MIXED_') ||
      c.startsWith('CANDIDATE_REMOVALS_') ||
      c.startsWith('INVALID_') ||
      c.startsWith('DUPLICATE_') ||
      c.startsWith('NOT_SAME_DAY') ||
      c.startsWith('MULTI_DAY_') ||
      c.startsWith('CREATE_WINDOW_') ||
      c.startsWith('ITEM_') ||
      c.startsWith('REDUCE_INTENSITY_'),
  );

  if (blocking.length) {
    return {
      admitted: false,
      reasonCodes: blocking,
      writeTargets: ['Trip', 'ItineraryItem'],
    };
  }

  return {
    admitted: true,
    reasonCodes: [
      isReduceIntensity
        ? 'SAME_DAY_REDUCE_INTENSITY'
        : isMoveAndAdd
          ? 'SAME_DAY_MOVE_AND_ADD'
          : isReorder
            ? 'SAME_DAY_REORDER_ITEMS'
            : isRemove
              ? 'SAME_DAY_REMOVE_ITEM'
              : isMultiDayFromCandidates
                ? 'MULTI_DAY_ADD_FROM_CANDIDATES'
                : isFromCandidates
                  ? 'SAME_DAY_ADD_FROM_CANDIDATES'
                  : isAdd
                    ? 'SAME_DAY_ADD_ITEM'
                    : 'SAME_DAY_TIME_ADJUST',
      'UNBOOKED_UNLOCKED',
      'NO_EXTERNAL_SIDE_EFFECT',
      'WRITE_TARGETS_TRIP_ITINERARY_ITEM',
      ...(isFromCandidates || isMultiDayFromCandidates
        ? (['CANDIDATE_POOL_DELETE'] as const)
        : []),
      ...(isMoveAndAdd || isReduceIntensity || isMultiDayFromCandidates
        ? (['ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN'] as const)
        : []),
    ],
    writeTargets: ['Trip', 'ItineraryItem'],
  };
}
