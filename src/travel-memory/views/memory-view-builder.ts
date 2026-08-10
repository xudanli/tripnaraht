/**
 * Memory Views — 从 Ledger 投影当前认知；LLM 不直接读事件流。
 */

import type { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import type { MemoryEventV1, MemoryFieldView } from '../types/memory-event.types';
import type {
  TripMemoryView,
  UserProfileMemoryView,
} from '../types/memory-context-package.types';

function toFieldView(event: MemoryEventV1): MemoryFieldView {
  return {
    key: event.predicate,
    value: event.value,
    confidence: event.confidence,
    scope: event.scope,
    status: event.status,
    sourceType: event.source.type,
    evidenceEventIds: [event.memoryEventId],
    validFrom: event.validTime.from,
    validTo: event.validTime.to,
    lastConfirmedAt:
      event.op === 'CONFIRM' ? event.systemTime.recordedAt : null,
  };
}

function isProfileEligible(event: MemoryEventV1): boolean {
  // CANDIDATE 永不进 Profile View；需 Explicit / Confirm / 晋升后的 ACTIVE
  if (event.status === 'CANDIDATE') return false;
  if (event.status === 'INVALIDATED' || event.status === 'SUPERSEDED' || event.status === 'REDACTED') {
    return false;
  }
  if (event.source.type === 'USER_EXPLICIT') return true;
  if (event.status === 'ACTIVE' && event.op === 'CONFIRM') return true;
  // Decision Outcome 推断默认不可见；仅当 value 显式标记 profileEligible
  if (event.source.type === 'DECISION_OUTCOME') {
    const v = event.value as { profileEligible?: boolean } | null;
    return v?.profileEligible === true && event.status === 'ACTIVE';
  }
  return event.status === 'ACTIVE' || event.status === 'INFERRED';
}

function pick<T = unknown>(
  ledger: MemoryLedgerStore,
  subjectId: string,
  predicate: string,
): MemoryFieldView<T> | undefined {
  const rows = ledger.list({
    subjectId,
    predicate,
    activeOnly: false,
  });
  for (let i = rows.length - 1; i >= 0; i--) {
    if (isProfileEligible(rows[i])) {
      return toFieldView(rows[i]) as MemoryFieldView<T>;
    }
  }
  return undefined;
}

export function buildUserProfileView(
  ledger: MemoryLedgerStore,
  userId: string,
): UserProfileMemoryView {
  return {
    pace: pick<string>(ledger, userId, 'travel.pace'),
    riskTolerance: pick<string>(ledger, userId, 'decision.riskTolerance'),
    accommodationMovement: pick<string>(
      ledger,
      userId,
      'travel.accommodationMovement',
    ),
    preferredExperience: pick<string[]>(
      ledger,
      userId,
      'travel.experiencePreference',
    ),
    planningStyle: pick<string>(ledger, userId, 'decision.planningStyle'),
  };
}

export function buildTripMemoryView(
  ledger: MemoryLedgerStore,
  tripId: string,
): TripMemoryView {
  return {
    tripId,
    tripGoal: pick<string>(ledger, tripId, 'trip.primaryGoal'),
    paceOverride: pick<string>(ledger, tripId, 'travel.pace'),
    nightDriving: pick<string>(ledger, tripId, 'travel.nightDriving'),
    maxDailyDrivingMinutes: pick<number>(
      ledger,
      tripId,
      'travel.maxDailyDrivingMinutes',
    ),
    temporaryConstraints: pick<unknown[]>(
      ledger,
      tripId,
      'trip.temporaryConstraints',
    ),
    participants: pick<Record<string, unknown>>(
      ledger,
      tripId,
      'trip.participants',
    ),
  };
}
