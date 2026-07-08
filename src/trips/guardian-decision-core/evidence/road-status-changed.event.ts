/**
 * RFC-001 PR-A — ROAD_STATUS_CHANGED trigger event.
 */

import type { TravelDecisionEvent } from './travel-decision-event.types';

export const ROAD_STATUS_CHANGED_EVENT = 'ROAD_STATUS_CHANGED' as const;

export type RoadStatusChangedStatus = 'CLOSED' | 'LIMITED' | 'OPEN' | 'UNKNOWN';

export type RoadStatusSourceProvider =
  | 'road.is_api'
  | 'road.is_api_or_cache'
  | 'vegagerdin_gagnaveita_fallback'
  | 'static_seasonal_data'
  | 'admin_injection';

export interface RoadStatusChangedPayload {
  roadId: string;
  segmentId?: string;
  status: RoadStatusChangedStatus;
  previousStatus?: RoadStatusChangedStatus;
  sourceProvider: RoadStatusSourceProvider;
  /** Normalized evidence id written by Evidence Resolver */
  evidenceRef?: string;
}

export type RoadStatusChangedEvent = TravelDecisionEvent<RoadStatusChangedPayload>;

export interface BuildRoadStatusChangedEventInput {
  tripId: string;
  roadId: string;
  status: RoadStatusChangedStatus;
  segmentId?: string;
  previousStatus?: RoadStatusChangedStatus;
  sourceProvider: RoadStatusSourceProvider;
  correlationId?: string;
  occurredAt?: string;
}

export function buildRoadStatusChangedEvent(
  input: BuildRoadStatusChangedEventInput,
): RoadStatusChangedEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const correlationId = input.correlationId ?? `corr_${input.tripId}_${input.roadId}`;
  return {
    eventId: `evt_road_${input.tripId}_${input.roadId}_${Date.now()}`,
    eventType: ROAD_STATUS_CHANGED_EVENT,
    aggregateType: 'TRIP',
    aggregateId: input.tripId,
    occurredAt,
    correlationId,
    ontologyVersion: 'rfc001-0.1.0',
    payload: {
      roadId: input.roadId.toUpperCase(),
      segmentId: input.segmentId,
      status: input.status,
      previousStatus: input.previousStatus,
      sourceProvider: input.sourceProvider,
    },
  };
}

export function mapRealtimeStatusToChangedStatus(
  currentStatus: string,
): RoadStatusChangedStatus {
  switch (currentStatus) {
    case 'closed':
      return 'CLOSED';
    case 'limited':
      return 'LIMITED';
    case 'open':
      return 'OPEN';
    default:
      return 'UNKNOWN';
  }
}
