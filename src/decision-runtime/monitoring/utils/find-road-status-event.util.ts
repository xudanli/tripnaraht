/**
 * Resolve ROAD_STATUS_CHANGED events from RFC-001 world store for monitoring replay.
 */

import type { StoredRfc001WorldState } from '../../../trips/guardian-decision-core/evidence/world-state-store.service';
import {
  ROAD_STATUS_CHANGED_EVENT,
  type RoadStatusChangedEvent,
  type RoadStatusChangedStatus,
  type RoadStatusChangedPayload,
} from '../../../trips/guardian-decision-core/evidence/road-status-changed.event';
import type { WorldStateAssertion } from '../../../trips/guardian-decision-core/contracts/world-state.types';
import type { RoadStatusAssertionPayload } from '../../../trips/guardian-decision-core/adapters/road-status-to-assertion.adapter';

export function findLatestRoadStatusEvent(
  store: StoredRfc001WorldState,
  tripId: string,
  roadId: string,
  status?: RoadStatusChangedStatus,
): RoadStatusChangedEvent | undefined {
  const normalizedRoad = roadId.toUpperCase();
  const matches = store.events
    .filter((event): event is RoadStatusChangedEvent => {
      if (event.eventType !== ROAD_STATUS_CHANGED_EVENT) return false;
      if (event.aggregateId !== tripId) return false;
      const payload = event.payload as RoadStatusChangedPayload;
      const payloadRoad = payload.roadId?.toUpperCase();
      if (payloadRoad !== normalizedRoad) return false;
      if (status && payload.status !== status) return false;
      return payload.status === 'CLOSED' || payload.status === 'LIMITED';
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return matches[0];
}

/** Prefer the event already linked to a persisted problem (replay idempotency). */
export function findRoadStatusEventForProcessing(
  store: StoredRfc001WorldState,
  tripId: string,
  roadId: string,
  problems: Array<{ triggerEventId?: string }>,
): RoadStatusChangedEvent | undefined {
  const normalizedRoad = roadId.toUpperCase();
  const matches = store.events
    .filter((event): event is RoadStatusChangedEvent => {
      if (event.eventType !== ROAD_STATUS_CHANGED_EVENT) return false;
      if (event.aggregateId !== tripId) return false;
      const payload = event.payload as RoadStatusChangedPayload;
      return payload.roadId?.toUpperCase() === normalizedRoad;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const linked = new Set(
    problems.map((p) => p.triggerEventId).filter((id): id is string => Boolean(id)),
  );
  return matches.find((e) => linked.has(e.eventId)) ?? matches[0];
}

export function findOpenRoadProblemId(
  problems: Array<{ problemId: string; triggerEventId?: string; status: string }>,
  triggerEventId: string,
): string | undefined {
  const match = problems.find(
    (p) =>
      p.triggerEventId === triggerEventId &&
      !['RESOLVED', 'FAILED', 'DISMISSED'].includes(p.status),
  );
  return match?.problemId;
}

export function findRoadProblemIdForEvent(
  problems: Array<{ problemId: string; triggerEventId?: string; status: string }>,
  triggerEventId: string,
): string | undefined {
  const open = findOpenRoadProblemId(problems, triggerEventId);
  if (open) return open;
  const any = [...problems]
    .filter((p) => p.triggerEventId === triggerEventId)
    .sort((a, b) => b.problemId.localeCompare(a.problemId));
  return any[0]?.problemId;
}

export function roadIdFromAssertion(
  assertion: WorldStateAssertion,
): string | undefined {
  const payload = assertion.payload as RoadStatusAssertionPayload;
  return payload.roadId?.toUpperCase();
}

export function findExistingRoadProblemId(
  problems: Array<{ problemId: string; status: string }>,
  roadId: string,
): string | undefined {
  const normalized = roadId.toUpperCase();
  const matches = problems.filter(
    (p) =>
      p.status !== 'FAILED' &&
      p.problemId.includes(`road_${normalized}_`),
  );
  return matches[matches.length - 1]?.problemId;
}
