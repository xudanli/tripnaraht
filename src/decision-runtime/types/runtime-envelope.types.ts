import type {
  RuntimeAggregateType,
  RuntimeCanonicalEventType,
  RuntimePrivacyClass,
} from './runtime-event-catalog';

/** PRD §17.2 Envelope v2 context stored in travel_events.metadata.runtime */
export interface RuntimeEnvelopeContext {
  envelopeVersion: 2;
  canonicalEventType: RuntimeCanonicalEventType;
  aggregateType: RuntimeAggregateType;
  aggregateId: string;
  aggregateVersion?: number;
  gate1ProjectId: string;
  organizationId?: string;
  actor: RuntimeActor;
  privacyClass: RuntimePrivacyClass;
  correlationId?: string;
  causationId?: string;
}

export interface RuntimeActor {
  type: 'USER' | 'SYSTEM' | 'AGENT';
  id: string;
  role?: string;
}

export interface Gate1EventAnchor {
  tripId: string;
  gate1ProjectId: string;
  organizationId?: string;
}

export interface BuildGate1RuntimeEnvelopeInput {
  anchor: Gate1EventAnchor;
  canonicalEventType: RuntimeCanonicalEventType;
  aggregateType: RuntimeAggregateType;
  aggregateId: string;
  aggregateVersion?: number;
  payload: Record<string, unknown>;
  actor: RuntimeActor;
  privacyClass: RuntimePrivacyClass;
  idempotencyKey: string;
  timestamp?: string;
  requestId?: string;
  correlationId?: string;
}
