/**
 * Capture CausalAlignmentTuple from parent/child itinerary revision snapshots.
 */

import type { ItineraryRevisionAuditDelta } from '../../agent/services/audit-record.service';
import type {
  AlignmentDiscardReason,
  CausalAlignmentTuple,
} from '../execution-simulation/alignment-tier3.types';
import { inferAlignmentPenalties } from '../execution-simulation/alignment-tier3.types';
import { buildExecutionIRFromSnapshot } from './build-execution-ir-from-itinerary.util';
import { hashJsonStable } from './hash-json-stable';

function flattenItems(snapshot: unknown): Array<Record<string, unknown>> {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const days = Array.isArray((snapshot as { days?: unknown }).days)
    ? (snapshot as { days: unknown[] }).days
    : Array.isArray((snapshot as { TripDay?: unknown }).TripDay)
      ? (snapshot as { TripDay: unknown[] }).TripDay
      : [];
  const out: Array<Record<string, unknown>> = [];
  for (const d of days) {
    const day = d as Record<string, unknown>;
    const items = Array.isArray(day.items)
      ? day.items
      : Array.isArray(day.ItineraryItem)
        ? day.ItineraryItem
        : [];
    for (const it of items) {
      if (it && typeof it === 'object') out.push(it as Record<string, unknown>);
    }
  }
  return out;
}

function itemKey(it: Record<string, unknown>): string {
  const id = String(it.id ?? it.item_id ?? '').trim();
  if (id) return id;
  const st = it.start_time ?? it.startTime;
  return `anon:${JSON.stringify(st ?? '')}`;
}

export function listRemovedItemIds(parent: unknown, child: unknown): string[] {
  const childKeys = new Set(flattenItems(child).map(itemKey));
  const removed: string[] = [];
  for (const it of flattenItems(parent)) {
    const k = itemKey(it);
    if (k.startsWith('anon:')) continue;
    if (!childKeys.has(k)) removed.push(k);
  }
  return removed;
}

export function listAddedItemIds(parent: unknown, child: unknown): string[] {
  const parentKeys = new Set(flattenItems(parent).map(itemKey));
  const added: string[] = [];
  for (const it of flattenItems(child)) {
    const k = itemKey(it);
    if (k.startsWith('anon:')) continue;
    if (!parentKeys.has(k)) added.push(k);
  }
  return added;
}

function estimateRemovedDurationMinutes(parent: unknown, removedIds: string[]): number {
  if (!removedIds.length) return 0;
  const idSet = new Set(removedIds);
  let total = 0;
  for (const it of flattenItems(parent)) {
    const k = itemKey(it);
    if (!idSet.has(k)) continue;
    const start = it.start_time ?? it.startTime;
    const end = it.end_time ?? it.endTime;
    const ps = typeof start === 'string' ? Date.parse(start) : start instanceof Date ? start.getTime() : NaN;
    const pe = typeof end === 'string' ? Date.parse(end) : end instanceof Date ? end.getTime() : NaN;
    if (Number.isFinite(ps) && Number.isFinite(pe) && pe > ps) {
      total += Math.round((pe - ps) / 60_000);
    }
  }
  return total;
}

function inferFromRemovedItems(parent: unknown, removedIds: string[]): AlignmentDiscardReason {
  const idSet = new Set(removedIds);
  for (const it of flattenItems(parent)) {
    if (!idSet.has(itemKey(it))) continue;
    const type = String(it.type ?? '').toUpperCase();
    if (type === 'DRIVE' || type === 'TRANSIT' || type === 'WALK') {
      return 'FATIGUE_OVERFLOW';
    }
    if (type === 'REST' || type === 'MEAL') {
      return 'SOCIAL_FRICTION';
    }
  }
  return 'PREFERENCE_SHIFT';
}

export function inferDiscardReasonFromAudit(params: {
  audit: ItineraryRevisionAuditDelta;
  removedItemIds: string[];
  parentSnapshot: unknown;
}): AlignmentDiscardReason {
  const rt = String(params.audit.resolution_type ?? '').trim();
  if (rt === 'ROLLBACK') return 'PREFERENCE_SHIFT';
  if (rt === 'POSTPONE_SCHEDULE') return 'TIME_CONFLICT';
  if (rt === 'UPGRADE_TO_DRIVE') return 'FATIGUE_OVERFLOW';
  if (params.audit.interrupted_items.length > 0) return 'TIME_CONFLICT';
  if (
    params.audit.delta_time_minutes != null &&
    Math.abs(params.audit.delta_time_minutes) >= 45
  ) {
    return 'TIME_CONFLICT';
  }
  if (params.removedItemIds.length > 0) {
    return inferFromRemovedItems(params.parentSnapshot, params.removedItemIds);
  }
  return 'UNKNOWN';
}

export function captureAlignmentTupleFromRevision(params: {
  tripId: string;
  parentSnapshot: unknown;
  childSnapshot: unknown;
  audit: ItineraryRevisionAuditDelta;
  revisionId?: string;
  source?: string;
  capturedAt?: string;
}): CausalAlignmentTuple {
  const capturedAt = params.capturedAt ?? new Date().toISOString();
  const removed = listRemovedItemIds(params.parentSnapshot, params.childSnapshot);
  const added = listAddedItemIds(params.parentSnapshot, params.childSnapshot);
  const discardReason = inferDiscardReasonFromAudit({
    audit: params.audit,
    removedItemIds: removed,
    parentSnapshot: params.parentSnapshot,
  });
  const durationMinutesRemoved = estimateRemovedDurationMinutes(params.parentSnapshot, removed);
  const affectedNodeIds = [
    ...new Set([
      ...removed,
      ...added,
      ...params.audit.interrupted_items.map((i) => i.item_id),
    ]),
  ];
  const penalties = inferAlignmentPenalties({
    affectedNodeIds,
    discardReason,
    durationMinutesRemoved,
  });

  const tupleSeed = {
    tripId: params.tripId,
    revisionId: params.revisionId,
    capturedAt,
    discardReason,
  };

  return {
    tupleId: `at3-${hashJsonStable(tupleSeed)}`,
    tripId: params.tripId,
    capturedAt,
    contextFingerprint: hashJsonStable(params.parentSnapshot),
    intendedIR: buildExecutionIRFromSnapshot(params.parentSnapshot),
    userModifiedIR: buildExecutionIRFromSnapshot(params.childSnapshot),
    discardReason,
    affectedNodeIds,
    organizationalPenalty: penalties.organizationalPenalty,
    physicalPenalty: penalties.physicalPenalty,
    metadata: {
      revisionId: params.revisionId,
      resolution_type: params.audit.resolution_type,
      source: params.source,
      removed_count: removed.length,
      added_count: added.length,
      duration_minutes_removed: durationMinutesRemoved,
    },
  };
}
