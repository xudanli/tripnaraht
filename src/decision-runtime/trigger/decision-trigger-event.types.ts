/**
 * M1 — Unified decision trigger event contract.
 * @see DECISION_RUNTIME_ROADMAP.md §8.2 M1
 */

export const DECISION_TRIGGER_EVENT_SCHEMA_ID = 'tripnara.decision_trigger_event@v1';

export type DecisionTriggerEventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DecisionTriggerEvent {
  schemaId: typeof DECISION_TRIGGER_EVENT_SCHEMA_ID;
  eventId: string;
  eventType: string;
  source: string;
  occurredAt: string;
  observedAt: string;
  severity: DecisionTriggerEventSeverity;
  confidence: number;
  tripId: string;
  affectedEntities: string[];
  evidence: unknown[];
  fingerprint?: string;
}

export function buildDecisionTriggerEvent(input: {
  eventId: string;
  eventType: string;
  source: string;
  tripId: string;
  severity?: DecisionTriggerEventSeverity;
  confidence?: number;
  affectedEntities?: string[];
  evidence?: unknown[];
  occurredAt?: string;
  observedAt?: string;
  fingerprint?: string;
}): DecisionTriggerEvent {
  const now = new Date().toISOString();
  return {
    schemaId: DECISION_TRIGGER_EVENT_SCHEMA_ID,
    eventId: input.eventId,
    eventType: input.eventType,
    source: input.source,
    occurredAt: input.occurredAt ?? now,
    observedAt: input.observedAt ?? now,
    severity: input.severity ?? 'MEDIUM',
    confidence: input.confidence ?? 0.8,
    tripId: input.tripId,
    affectedEntities: input.affectedEntities ?? [],
    evidence: input.evidence ?? [],
    fingerprint: input.fingerprint,
  };
}
