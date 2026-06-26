import {
  Gate1TravelEventType,
  RuntimeCanonicalEventType,
} from '../types/runtime-event-catalog';
import { TravelEventType } from '../../trips/event-store/types/travel-event.types';
import type { TravelEventRecord } from './decision-workspace.projection';

export interface AuditTimelineEntry {
  eventId: string;
  occurredAt: string;
  eventType: string;
  source: string;
  canonicalEventType: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  actor: { type: string; id: string; role?: string } | null;
  privacyClass: string | null;
  summary: string;
}

const CANONICAL_LABELS: Record<string, string> = {
  [RuntimeCanonicalEventType.DECISION_RECORDED]: 'Decision recorded',
  [RuntimeCanonicalEventType.CONFLICT_DETECTED]: 'Conflict report published',
  [RuntimeCanonicalEventType.CONFLICT_CONFIRMED]: 'Conflict confirmed',
  [RuntimeCanonicalEventType.CONFLICT_DISMISSED]: 'Conflict dismissed',
  [RuntimeCanonicalEventType.READINESS_BLOCKER_RAISED]: 'Readiness blocker raised',
  [RuntimeCanonicalEventType.READINESS_BLOCKER_RESOLVED]: 'Readiness blocker resolved',
  [RuntimeCanonicalEventType.READINESS_ASSESSMENT_RECORDED]: 'Readiness assessment recorded',
  [RuntimeCanonicalEventType.SENSITIVE_DATA_ACCESSED]: 'Sensitive data accessed',
  [RuntimeCanonicalEventType.OUTCOME_RECORDED]: 'Outcome recorded',
  [RuntimeCanonicalEventType.COMMAND_REJECTED]: 'Command rejected',
  [TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED]: 'Trip status changed',
};

function runtimeMeta(event: TravelEventRecord): Record<string, unknown> | undefined {
  const meta = event.metadata;
  if (!meta || typeof meta !== 'object') return undefined;
  const runtime = (meta as Record<string, unknown>).runtime;
  return runtime && typeof runtime === 'object'
    ? (runtime as Record<string, unknown>)
    : undefined;
}

function summarize(event: TravelEventRecord, canonical: string | null): string {
  if (canonical && CANONICAL_LABELS[canonical]) {
    return CANONICAL_LABELS[canonical];
  }
  if (event.eventType === TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED) {
    const prev = event.payload.previousStatus;
    const next = event.payload.newStatus;
    return `Trip ${String(prev)} → ${String(next)}`;
  }
  return event.eventType;
}

/** Chronological audit view from travel_events (Tier 2.4). */
export function projectAuditTimeline(events: TravelEventRecord[]): AuditTimelineEntry[] {
  const relevant = events.filter((e) => {
    if (e.eventType.startsWith('gate1.')) return true;
    if (e.eventType === TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED) return true;
    if (e.eventType === TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED) return true;
    return false;
  });

  return relevant.map((event) => {
    const rt = runtimeMeta(event);
    const canonical =
      typeof rt?.canonicalEventType === 'string' ? rt.canonicalEventType : null;
    const actorRaw = rt?.actor;
    const actor =
      actorRaw &&
      typeof actorRaw === 'object' &&
      'type' in actorRaw &&
      'id' in actorRaw
        ? {
            type: String((actorRaw as Record<string, unknown>).type),
            id: String((actorRaw as Record<string, unknown>).id),
            role:
              typeof (actorRaw as Record<string, unknown>).role === 'string'
                ? ((actorRaw as Record<string, unknown>).role as string)
                : undefined,
          }
        : null;

    return {
      eventId: event.id,
      occurredAt:
        event.occurredAt instanceof Date
          ? event.occurredAt.toISOString()
          : String(event.occurredAt),
      eventType: event.eventType,
      source: event.source,
      canonicalEventType: canonical,
      aggregateType:
        typeof rt?.aggregateType === 'string' ? rt.aggregateType : null,
      aggregateId: typeof rt?.aggregateId === 'string' ? rt.aggregateId : null,
      actor,
      privacyClass:
        typeof rt?.privacyClass === 'string' ? rt.privacyClass : null,
      summary: summarize(event, canonical),
    };
  });
}

export { Gate1TravelEventType };
