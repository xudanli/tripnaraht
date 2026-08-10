/**
 * Project optional UWC-1e Preview open hints onto PlanProposal.
 * When fields are absent / open=false, clients keep legacy Confirm→Apply (arrange) behavior.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import { resolveTripRevision } from '../../trip-constraint-solver/utils/trip-revision.util';
import {
  buildDayDateTime,
  resolveTripDayByIndex,
} from '../../utils/arrange-itinerary-day.util';
import { resolveTripTimezone } from '../../../common/utils/destination-timezone.util';
import type { PlanProposal, PlanProposalChange } from '../types/plan-proposal.types';

export type UwcPreviewTimeUpdate = {
  itemId: string;
  startTimeIso: string;
  endTimeIso: string;
};

export type UwcPreviewItemCreate = {
  tripDayId: string;
  placeId?: number | null;
  type?: string;
  startTimeIso: string;
  endTimeIso: string;
  note?: string | null;
  clientItemKey?: string;
};

export type PlanProposalUwcPreview =
  | {
      open: true;
      slice: 'itinerary_same_day_time_adjust';
      expectedTripRevision: number;
      timeUpdates: UwcPreviewTimeUpdate[];
    }
  | {
      open: true;
      slice: 'itinerary_same_day_add_item';
      expectedTripRevision: number;
      itemCreates: UwcPreviewItemCreate[];
    }
  | {
      open: true;
      slice: 'itinerary_same_day_add_from_candidates';
      expectedTripRevision: number;
      itemCreates: UwcPreviewItemCreate[];
      candidateRemovals: string[];
    }
  | {
      open: true;
      slice: 'itinerary_multi_day_add_from_candidates';
      expectedTripRevision: number;
      itemCreates: UwcPreviewItemCreate[];
      candidateRemovals: string[];
    }
  | {
      open: true;
      slice: 'itinerary_same_day_remove_item';
      expectedTripRevision: number;
      itemRemovals: string[];
    }
  | {
      open: true;
      slice: 'itinerary_same_day_reorder_items';
      expectedTripRevision: number;
      itemReorders: Array<{ itemId: string; order: number }>;
    }
  | {
      open: true;
      slice: 'itinerary_same_day_move_and_add';
      expectedTripRevision: number;
      timeUpdates: UwcPreviewTimeUpdate[];
      itemCreates: UwcPreviewItemCreate[];
    }
  | {
      open: true;
      slice: 'itinerary_same_day_reduce_intensity';
      expectedTripRevision: number;
      timeUpdates: UwcPreviewTimeUpdate[];
      itemCreates: UwcPreviewItemCreate[];
    }
  | {
      open: true;
      slice: 'unified_plan_version_only';
      decisionId: string;
      planVersionId: string;
      expectedPlanVersionId: string;
    }
  | {
      open: false;
      reasonCodes: string[];
    };

function readPayloadString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const v = payload?.[key];
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s || undefined;
}

function tryUnifiedFromProposal(proposal: PlanProposal): PlanProposalUwcPreview | null {
  const payload = proposal.source?.payload ?? {};
  const decisionId =
    readPayloadString(payload, 'decisionId') ??
    readPayloadString(payload, 'decision_id');
  const planVersionId =
    readPayloadString(payload, 'planVersionId') ??
    readPayloadString(payload, 'plan_version_id') ??
    readPayloadString(payload, 'pendingPlanVersionId');
  const expectedPlanVersionId =
    readPayloadString(payload, 'expectedPlanVersionId') ??
    readPayloadString(payload, 'expected_plan_version_id') ??
    readPayloadString(payload, 'expectedEffectivePlanVersionId') ??
    readPayloadString(payload, 'basePlanVersionId');

  if (decisionId && planVersionId && expectedPlanVersionId) {
    return {
      open: true,
      slice: 'unified_plan_version_only',
      decisionId,
      planVersionId,
      expectedPlanVersionId,
    };
  }
  return null;
}

function isSameDayTimeOnlyChange(change: PlanProposalChange): boolean {
  if (change.operation !== 'MOVE') return false;
  if (!change.itemId?.trim()) return false;
  if (!change.startTime || !change.endTime) return false;
  return true;
}

function isSameDayAddOnlyChange(change: PlanProposalChange): boolean {
  if (change.operation !== 'ADD') return false;
  if (typeof change.placeId !== 'number' || !Number.isFinite(change.placeId)) {
    return false;
  }
  if (!change.startTime || !change.endTime) return false;
  return true;
}

function trySameDayTimeUpdates(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
  timezone: string,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length === 0) return null;
  if (!changes.every(isSameDayTimeOnlyChange)) return null;

  const dayIndexes = [...new Set(changes.map((c) => c.dayIndex))];
  if (dayIndexes.length !== 1) return null;

  const dayIndex = dayIndexes[0]!;
  let dayDate: Date;
  try {
    dayDate = resolveTripDayByIndex(tripDays, dayIndex).date;
  } catch {
    return null;
  }

  const timeUpdates: UwcPreviewTimeUpdate[] = [];
  for (const change of changes) {
    try {
      const start = buildDayDateTime(dayDate, change.startTime!, timezone);
      const end = buildDayDateTime(dayDate, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
      if (end.getTime() <= start.getTime()) return null;
      timeUpdates.push({
        itemId: change.itemId!,
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
      });
    } catch {
      return null;
    }
  }

  if (timeUpdates.length === 0) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_time_adjust',
    expectedTripRevision,
    timeUpdates,
  };
}

function trySameDayAddItemCreates(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
  timezone: string,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length === 0) return null;
  if (!changes.every(isSameDayAddOnlyChange)) return null;

  const dayIndexes = [...new Set(changes.map((c) => c.dayIndex))];
  if (dayIndexes.length !== 1) return null;

  const dayIndex = dayIndexes[0]!;
  let tripDay: { id: string; date: Date };
  try {
    tripDay = resolveTripDayByIndex(tripDays, dayIndex);
  } catch {
    return null;
  }

  const itemCreates: UwcPreviewItemCreate[] = [];
  for (const change of changes) {
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
      if (end.getTime() <= start.getTime()) return null;
      itemCreates.push({
        tripDayId: tripDay.id,
        placeId: change.placeId!,
        type: change.itemType?.trim() || 'ACTIVITY',
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        note: change.note ?? change.label ?? null,
        clientItemKey:
          change.candidateId?.trim() ||
          change.itemId?.trim() ||
          `add-${change.placeId}-${change.startTime}`,
      });
    } catch {
      return null;
    }
  }

  if (itemCreates.length === 0) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_add_item',
    expectedTripRevision,
    itemCreates,
  };
}

/**
 * AUTO_ARRANGE / FILL_GAP single-day: ADD(+placeId+times) paired with REMOVE_CANDIDATE.
 * Multi-day or MOVE mixes stay closed.
 */
function trySameDayAddFromCandidates(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
  timezone: string,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length === 0) return null;

  const adds = changes.filter((c) => c.operation === 'ADD');
  const removals = changes.filter((c) => c.operation === 'REMOVE_CANDIDATE');
  if (!adds.length || !removals.length) return null;
  if (adds.length + removals.length !== changes.length) return null;
  if (!adds.every(isSameDayAddOnlyChange)) return null;
  if (!removals.every((c) => Boolean(c.candidateId?.trim()))) return null;

  const dayIndexes = [
    ...new Set([...adds, ...removals].map((c) => c.dayIndex)),
  ];
  if (dayIndexes.length !== 1) return null;

  const dayIndex = dayIndexes[0]!;
  let tripDay: { id: string; date: Date };
  try {
    tripDay = resolveTripDayByIndex(tripDays, dayIndex);
  } catch {
    return null;
  }

  const itemCreates: UwcPreviewItemCreate[] = [];
  for (const change of adds) {
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
      if (end.getTime() <= start.getTime()) return null;
      itemCreates.push({
        tripDayId: tripDay.id,
        placeId: change.placeId!,
        type: change.itemType?.trim() || 'ACTIVITY',
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        note: change.note ?? change.label ?? null,
        clientItemKey:
          change.candidateId?.trim() ||
          change.itemId?.trim() ||
          `add-${change.placeId}-${change.startTime}`,
      });
    } catch {
      return null;
    }
  }

  const candidateRemovals = [
    ...new Set(
      [
        ...removals.map((c) => c.candidateId!.trim()),
        ...adds
          .filter((c) => c.removeFromCandidates && c.candidateId?.trim())
          .map((c) => c.candidateId!.trim()),
      ].filter(Boolean),
    ),
  ];
  if (!candidateRemovals.length) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_add_from_candidates',
    expectedTripRevision,
    itemCreates,
    candidateRemovals,
  };
}

/**
 * Multi-day AUTO_ARRANGE / FILL_GAP: ADD(+placeId+times) + REMOVE_CANDIDATE across ≥2 days.
 * All-or-nothing Apply (one txn) — XOR vs same-day from-candidates.
 */
function tryMultiDayAddFromCandidates(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
  timezone: string,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length === 0) return null;

  const adds = changes.filter((c) => c.operation === 'ADD');
  const removals = changes.filter((c) => c.operation === 'REMOVE_CANDIDATE');
  if (!adds.length || !removals.length) return null;
  if (adds.length + removals.length !== changes.length) return null;
  if (!adds.every(isSameDayAddOnlyChange)) return null;
  if (!removals.every((c) => Boolean(c.candidateId?.trim()))) return null;

  const dayIndexes = [
    ...new Set([...adds, ...removals].map((c) => c.dayIndex)),
  ];
  if (dayIndexes.length < 2) return null;

  const itemCreates: UwcPreviewItemCreate[] = [];
  for (const change of adds) {
    let tripDay: { id: string; date: Date };
    try {
      tripDay = resolveTripDayByIndex(tripDays, change.dayIndex);
    } catch {
      return null;
    }
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return null;
      }
      if (end.getTime() <= start.getTime()) return null;
      itemCreates.push({
        tripDayId: tripDay.id,
        placeId: change.placeId!,
        type: change.itemType?.trim() || 'ACTIVITY',
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        note: change.note ?? change.label ?? null,
        clientItemKey:
          change.candidateId?.trim() ||
          change.itemId?.trim() ||
          `add-${change.placeId}-${change.dayIndex}-${change.startTime}`,
      });
    } catch {
      return null;
    }
  }

  const tripDayIds = new Set(itemCreates.map((c) => c.tripDayId));
  if (tripDayIds.size < 2) return null;

  const candidateRemovals = [
    ...new Set(
      [
        ...removals.map((c) => c.candidateId!.trim()),
        ...adds
          .filter((c) => c.removeFromCandidates && c.candidateId?.trim())
          .map((c) => c.candidateId!.trim()),
      ].filter(Boolean),
    ),
  ];
  if (!candidateRemovals.length) return null;

  return {
    open: true,
    slice: 'itinerary_multi_day_add_from_candidates',
    expectedTripRevision,
    itemCreates,
    candidateRemovals,
  };
}

function isSameDayRemoveOnlyChange(change: PlanProposalChange): boolean {
  if (change.operation !== 'REMOVE') return false;
  if (!change.itemId?.trim()) return false;
  return true;
}

function trySameDayRemoveItems(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length === 0) return null;
  if (!changes.every(isSameDayRemoveOnlyChange)) return null;

  const dayIndexes = [...new Set(changes.map((c) => c.dayIndex))];
  if (dayIndexes.length !== 1) return null;

  try {
    resolveTripDayByIndex(tripDays, dayIndexes[0]!);
  } catch {
    return null;
  }

  const itemRemovals = [
    ...new Set(changes.map((c) => c.itemId!.trim()).filter(Boolean)),
  ];
  if (!itemRemovals.length) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_remove_item',
    expectedTripRevision,
    itemRemovals,
  };
}

/** REORDER only — no start/end (time rewrite belongs to time-adjust). */
function isSameDayReorderOnlyChange(change: PlanProposalChange): boolean {
  if (change.operation !== 'REORDER') return false;
  if (!change.itemId?.trim()) return false;
  if (change.startTime || change.endTime) return false;
  return true;
}

function trySameDayReorderItems(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length === 0) return null;
  if (!changes.every(isSameDayReorderOnlyChange)) return null;

  const dayIndexes = [...new Set(changes.map((c) => c.dayIndex))];
  if (dayIndexes.length !== 1) return null;

  try {
    resolveTripDayByIndex(tripDays, dayIndexes[0]!);
  } catch {
    return null;
  }

  const seen = new Set<string>();
  const itemReorders: Array<{ itemId: string; order: number }> = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]!;
    const itemId = c.itemId!.trim();
    if (seen.has(itemId)) return null;
    seen.add(itemId);
    const order =
      typeof c.order === 'number' && Number.isFinite(c.order) && c.order >= 0
        ? Math.floor(c.order)
        : i + 1;
    itemReorders.push({ itemId, order });
  }
  if (!itemReorders.length) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_reorder_items',
    expectedTripRevision,
    itemReorders,
  };
}

function isSameDayRestAddOnlyChange(change: PlanProposalChange): boolean {
  if (change.operation !== 'ADD') return false;
  if (String(change.itemType ?? '').toUpperCase() !== 'REST') return false;
  if (typeof change.placeId === 'number' && Number.isFinite(change.placeId)) {
    return false;
  }
  if (!change.startTime || !change.endTime) return false;
  return true;
}

function trySameDayReduceIntensity(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
  timezone: string,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length < 2) return null;
  if (
    !changes.every(
      (c) => isSameDayTimeOnlyChange(c) || isSameDayRestAddOnlyChange(c),
    )
  ) {
    return null;
  }
  const moves = changes.filter(isSameDayTimeOnlyChange);
  const rests = changes.filter(isSameDayRestAddOnlyChange);
  if (!moves.length || !rests.length) return null;
  if (moves.length + rests.length !== changes.length) return null;

  const dayIndexes = [...new Set(changes.map((c) => c.dayIndex))];
  if (dayIndexes.length !== 1) return null;

  const dayIndex = dayIndexes[0]!;
  let tripDay: { id: string; date: Date };
  try {
    tripDay = resolveTripDayByIndex(tripDays, dayIndex);
  } catch {
    return null;
  }

  const timeUpdates: UwcPreviewTimeUpdate[] = [];
  for (const change of moves) {
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return null;
      }
      if (end.getTime() <= start.getTime()) return null;
      timeUpdates.push({
        itemId: change.itemId!,
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
      });
    } catch {
      return null;
    }
  }

  const itemCreates: UwcPreviewItemCreate[] = [];
  for (const change of rests) {
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return null;
      }
      if (end.getTime() <= start.getTime()) return null;
      itemCreates.push({
        tripDayId: tripDay.id,
        placeId: null,
        type: 'REST',
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        note: change.note ?? change.label ?? null,
        clientItemKey:
          change.itemId?.trim() || `rest-${change.dayIndex}-${change.startTime}`,
      });
    } catch {
      return null;
    }
  }

  if (!timeUpdates.length || !itemCreates.length) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_reduce_intensity',
    expectedTripRevision,
    timeUpdates,
    itemCreates,
  };
}

function trySameDayMoveAndAdd(
  proposal: PlanProposal,
  tripDays: Array<{ id: string; date: Date }>,
  expectedTripRevision: number,
  timezone: string,
): PlanProposalUwcPreview | null {
  const changes = proposal.changes ?? [];
  if (changes.length < 2) return null;
  if (
    !changes.every(
      (c) => isSameDayTimeOnlyChange(c) || isSameDayAddOnlyChange(c),
    )
  ) {
    return null;
  }
  const moves = changes.filter(isSameDayTimeOnlyChange);
  const adds = changes.filter(isSameDayAddOnlyChange);
  if (!moves.length || !adds.length) return null;
  if (moves.length + adds.length !== changes.length) return null;

  const dayIndexes = [...new Set(changes.map((c) => c.dayIndex))];
  if (dayIndexes.length !== 1) return null;

  const dayIndex = dayIndexes[0]!;
  let tripDay: { id: string; date: Date };
  try {
    tripDay = resolveTripDayByIndex(tripDays, dayIndex);
  } catch {
    return null;
  }

  const timeUpdates: UwcPreviewTimeUpdate[] = [];
  for (const change of moves) {
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return null;
      }
      if (end.getTime() <= start.getTime()) return null;
      timeUpdates.push({
        itemId: change.itemId!,
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
      });
    } catch {
      return null;
    }
  }

  const itemCreates: UwcPreviewItemCreate[] = [];
  for (const change of adds) {
    try {
      const start = buildDayDateTime(tripDay.date, change.startTime!, timezone);
      const end = buildDayDateTime(tripDay.date, change.endTime!, timezone);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return null;
      }
      if (end.getTime() <= start.getTime()) return null;
      itemCreates.push({
        tripDayId: tripDay.id,
        placeId: change.placeId!,
        type: change.itemType?.trim() || 'ACTIVITY',
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        note: change.note ?? change.label ?? null,
        clientItemKey:
          change.candidateId?.trim() ||
          change.itemId?.trim() ||
          `add-${change.placeId}-${change.startTime}`,
      });
    } catch {
      return null;
    }
  }

  if (!timeUpdates.length || !itemCreates.length) return null;

  return {
    open: true,
    slice: 'itinerary_same_day_move_and_add',
    expectedTripRevision,
    timeUpdates,
    itemCreates,
  };
}

export async function projectPlanProposalUwcPreview(
  prisma: PrismaService,
  proposal: PlanProposal,
): Promise<PlanProposalUwcPreview> {
  const unified = tryUnifiedFromProposal(proposal);
  if (unified) return unified;

  const trip = await prisma.trip.findUnique({
    where: { id: proposal.tripId },
    select: {
      updatedAt: true,
      metadata: true,
      destination: true,
      TripDay: {
        orderBy: { date: 'asc' },
        select: { id: true, date: true },
      },
    },
  });
  if (!trip) {
    return { open: false, reasonCodes: ['TRIP_NOT_FOUND'] };
  }

  const { revision } = resolveTripRevision({
    updatedAt: trip.updatedAt,
    metadata: trip.metadata,
  });
  const timezone = resolveTripTimezone({
    destination: trip.destination,
    metadata: trip.metadata,
  });

  const reduceIntensity = trySameDayReduceIntensity(
    proposal,
    trip.TripDay ?? [],
    revision,
    timezone,
  );
  if (reduceIntensity) return reduceIntensity;

  const moveAndAdd = trySameDayMoveAndAdd(
    proposal,
    trip.TripDay ?? [],
    revision,
    timezone,
  );
  if (moveAndAdd) return moveAndAdd;

  const sameDay = trySameDayTimeUpdates(
    proposal,
    trip.TripDay ?? [],
    revision,
    timezone,
  );
  if (sameDay) return sameDay;

  const sameDayAdd = trySameDayAddItemCreates(
    proposal,
    trip.TripDay ?? [],
    revision,
    timezone,
  );
  if (sameDayAdd) return sameDayAdd;

  const multiDayFromCandidates = tryMultiDayAddFromCandidates(
    proposal,
    trip.TripDay ?? [],
    revision,
    timezone,
  );
  if (multiDayFromCandidates) return multiDayFromCandidates;

  const fromCandidates = trySameDayAddFromCandidates(
    proposal,
    trip.TripDay ?? [],
    revision,
    timezone,
  );
  if (fromCandidates) return fromCandidates;

  const sameDayRemove = trySameDayRemoveItems(
    proposal,
    trip.TripDay ?? [],
    revision,
  );
  if (sameDayRemove) return sameDayRemove;

  const sameDayReorder = trySameDayReorderItems(
    proposal,
    trip.TripDay ?? [],
    revision,
  );
  if (sameDayReorder) return sameDayReorder;

  return {
    open: false,
    reasonCodes: [
      'UWC_PREVIEW_NOT_OPENED',
      'MISSING_TIME_UPDATES_OR_ADD_OR_FROM_CANDIDATES_OR_REMOVE_OR_REORDER_OR_MOVE_ADD_OR_PLAN_VERSION_TRIPLET',
    ],
  };
}

export async function enrichPlanProposalWithUwcPreview(
  prisma: PrismaService,
  proposal: PlanProposal,
): Promise<PlanProposal> {
  const uwcPreview = await projectPlanProposalUwcPreview(prisma, proposal);
  return { ...proposal, uwcPreview };
}
