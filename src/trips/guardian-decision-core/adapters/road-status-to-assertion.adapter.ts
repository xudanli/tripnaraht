/**
 * PR-A — RoadStatus / ROAD_STATUS_CHANGED → WorldStateAssertion.
 * Only Evidence Resolver should call this adapter in production paths.
 */

import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import type { EntityRef } from '../contracts/entity-ref.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WorldStateAssertionSource } from '../contracts/world-state.types';
import {
  RFC001_EVIDENCE_RESOLVER_VERSION,
  RFC001_ROAD_ASSERTION_VALIDITY_MS,
} from '../config/rfc001-iceland.config';
import type {
  RoadStatusChangedEvent,
  RoadStatusChangedStatus,
  RoadStatusSourceProvider,
} from '../evidence/road-status-changed.event';
import { mapRealtimeStatusToChangedStatus } from '../evidence/road-status-changed.event';

export interface RoadStatusAssertionPayload {
  roadId: string;
  status: RoadStatusChangedStatus;
  rawStatus?: string;
  previousStatus?: RoadStatusChangedStatus;
  statusMessage?: string;
  dataSource?: string;
}

export interface RoadStatusToAssertionInput {
  tripId: string;
  roadId: string;
  segmentId?: string;
  status: RoadStatusChangedStatus;
  previousStatus?: RoadStatusChangedStatus;
  evidenceRef: string;
  sourceProvider: RoadStatusSourceProvider;
  observedAt: string;
  confidence: number;
  assertionId?: string;
}

function resolveSubjectRef(
  tripId: string,
  roadId: string,
  segmentId?: string,
): EntityRef {
  if (segmentId) {
    return { kind: 'ROUTE_SEGMENT', id: segmentId, label: roadId };
  }
  return {
    kind: 'ROUTE_SEGMENT',
    id: `road:${roadId}:trip:${tripId}`,
    label: roadId,
  };
}

function mapProviderToSourceType(
  provider: RoadStatusSourceProvider,
): WorldStateAssertionSource['sourceType'] {
  if (provider === 'admin_injection') return 'INTERNAL';
  if (provider === 'static_seasonal_data') return 'MODEL';
  if (provider === 'vegagerdin_gagnaveita_fallback') return 'PARTNER';
  return 'OFFICIAL';
}

export function buildEvidenceRefForRoad(
  tripId: string,
  roadId: string,
  observedAt: string,
): string {
  const bucket = observedAt.slice(0, 13);
  return `ev_road_${roadId.toLowerCase()}_${tripId.slice(0, 8)}_${bucket}`;
}

export function roadStatusChangedToAssertion(
  input: RoadStatusToAssertionInput,
): WorldStateAssertion<RoadStatusAssertionPayload> {
  const assertionId =
    input.assertionId ??
    `wsa_${input.roadId.toLowerCase()}_${input.tripId.slice(0, 8)}_${Date.now()}`;
  const validUntil = new Date(
    new Date(input.observedAt).getTime() + RFC001_ROAD_ASSERTION_VALIDITY_MS,
  ).toISOString();

  const source: WorldStateAssertionSource = {
    provider: input.sourceProvider,
    sourceType: mapProviderToSourceType(input.sourceProvider),
    evidenceRefs: [input.evidenceRef],
  };

  return {
    assertionId,
    subjectRef: resolveSubjectRef(input.tripId, input.roadId, input.segmentId),
    predicate: 'road.status',
    payload: {
      roadId: input.roadId.toUpperCase(),
      status: input.status,
      previousStatus: input.previousStatus,
    },
    source,
    observedAt: input.observedAt,
    validFrom: input.observedAt,
    validUntil,
    confidence: Math.min(1, Math.max(0, input.confidence)),
    status: input.status === 'UNKNOWN' ? 'DISPUTED' : 'ACTIVE',
    version: 1,
  };
}

export function roadStatusSnapshotToAssertion(
  tripId: string,
  rs: RoadStatus,
  opts?: { segmentId?: string; event?: RoadStatusChangedEvent },
): WorldStateAssertion<RoadStatusAssertionPayload> {
  const roadId = rs.roadId.toUpperCase();
  const observedAt = rs.lastVerifiedAt.toISOString();
  const status = mapRealtimeStatusToChangedStatus(rs.currentStatus);
  const evidenceRef = buildEvidenceRefForRoad(tripId, roadId, observedAt);
  const sourceProvider: RoadStatusSourceProvider = rs.seasonalFallback
    ? 'static_seasonal_data'
    : rs.dataSource?.includes('cache')
      ? 'road.is_api_or_cache'
      : 'road.is_api';

  return roadStatusChangedToAssertion({
    tripId,
    roadId,
    segmentId: opts?.segmentId ?? opts?.event?.payload.segmentId,
    status,
    previousStatus: opts?.event?.payload.previousStatus,
    evidenceRef,
    sourceProvider,
    observedAt,
    confidence: rs.confidence ?? (rs.seasonalFallback ? 0.6 : 0.9),
  });
}

/** UNKNOWN must not be coerced to OPEN/PASS downstream */
export function assertionImpliesHardClosure(
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>,
): boolean {
  return assertion.payload.status === 'CLOSED';
}
