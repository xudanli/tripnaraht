/**
 * Phase 3 — ROAD_SEGMENT_UNAVAILABLE semantic capability (destination-agnostic).
 */

export const ROAD_SEGMENT_UNAVAILABLE = 'ROAD_SEGMENT_UNAVAILABLE' as const;
export const ROAD_SEGMENT_RESTRICTED = 'ROAD_SEGMENT_RESTRICTED' as const;

export type RoadUnavailableSemanticKey =
  | typeof ROAD_SEGMENT_UNAVAILABLE
  | typeof ROAD_SEGMENT_RESTRICTED;

/** Canonical semantic key for a road-unavailability problem instance */
export function buildRoadSegmentUnavailableSemanticKey(triggerEventId: string): string {
  return `${ROAD_SEGMENT_UNAVAILABLE}:${triggerEventId}`;
}

/** Build canonical semantic key from RFC-001 problem fields */
export function buildRfc001ProblemSemanticKey(
  problemType: string,
  triggerEventId: string,
): string {
  if (problemType === 'FEASIBILITY_FAILURE' || problemType === 'road_close') {
    return buildRoadSegmentUnavailableSemanticKey(triggerEventId);
  }
  return `rfc001:${problemType}:${triggerEventId}`;
}

/** Strip instance suffix → capability key for registry routing */
export function baseRoadSemanticCapability(semanticKey: string): string {
  if (semanticKey.startsWith(`${ROAD_SEGMENT_UNAVAILABLE}:`)) {
    return ROAD_SEGMENT_UNAVAILABLE;
  }
  if (semanticKey.startsWith(`${ROAD_SEGMENT_RESTRICTED}:`)) {
    return ROAD_SEGMENT_RESTRICTED;
  }
  const normalized = normalizeRoadSemanticKey(semanticKey);
  if (normalized?.startsWith(`${ROAD_SEGMENT_UNAVAILABLE}:`)) {
    return ROAD_SEGMENT_UNAVAILABLE;
  }
  if (normalized?.startsWith(`${ROAD_SEGMENT_RESTRICTED}:`)) {
    return ROAD_SEGMENT_RESTRICTED;
  }
  return semanticKey;
}

/** Parse legacy rfc001-prefixed keys into canonical semantic key */
export function normalizeRoadSemanticKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith(`${ROAD_SEGMENT_UNAVAILABLE}:`)) return raw;
  if (raw.startsWith('rfc001:') && raw.includes('FEASIBILITY')) {
    const parts = raw.split(':');
    const eventId = parts[parts.length - 1];
    return buildRoadSegmentUnavailableSemanticKey(eventId);
  }
  if (raw.startsWith('rfc001:road_close:')) {
    return buildRoadSegmentUnavailableSemanticKey(raw.replace('rfc001:road_close:', ''));
  }
  const legacy = /^rfc001:([^:]+):(.+)$/.exec(raw);
  if (
    legacy &&
    (legacy[1] === 'FEASIBILITY_FAILURE' || legacy[1] === 'road_close')
  ) {
    return buildRoadSegmentUnavailableSemanticKey(legacy[2]);
  }
  return raw;
}
