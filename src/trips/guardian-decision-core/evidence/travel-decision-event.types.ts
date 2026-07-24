/**
 * RFC-001 — travel decision domain events (append-only envelope).
 */

export type TravelDecisionAggregateType =
  | 'TRIP'
  | 'PLAN'
  | 'DECISION'
  | 'EXECUTION';

export interface TravelDecisionEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  aggregateType: TravelDecisionAggregateType;
  aggregateId: string;
  occurredAt: string;
  causationId?: string;
  correlationId: string;
  ontologyVersion: string;
  payload: TPayload;
}
