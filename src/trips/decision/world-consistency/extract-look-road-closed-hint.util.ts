/**
 * Extract Look "suspected road closed" hint from observation facts.
 * Never produces authoritative road.status.
 */

import type { ObservationFact } from '../../travel-observation/observation.types';
import {
  buildLookRoadSuspectedClosedHint,
  type LookRoadSuspectedClosedHint,
} from './look-road-authority-bridge.types';

export const LOOK_ROAD_CLOSED_HINT_KEYS = [
  'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
  'DATA_CONFLICT.ROAD_STATUS_CONFLICT',
] as const;

export function isLookRoadClosedSuspectedFact(fact: ObservationFact): boolean {
  return (LOOK_ROAD_CLOSED_HINT_KEYS as readonly string[]).includes(
    fact.semanticKey,
  );
}

export function extractRelatedRoadIdFromLookFacts(
  facts: ObservationFact[],
): string | undefined {
  const froad = facts.find(
    (f) => f.semanticKey === 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
  );
  if (typeof froad?.value === 'string' && froad.value.trim()) {
    return froad.value.trim().toUpperCase();
  }

  const closed = facts.find(
    (f) => f.semanticKey === 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
  );
  if (typeof closed?.value === 'string' && closed.value.trim()) {
    const v = closed.value.trim().toUpperCase();
    // Prefer values that look like road ids (F208, 1, Ring Road codes)
    if (/^[A-Z]?\d+[A-Z]?$/i.test(v) || /^F\d+/i.test(v)) return v;
  }

  const conflict = facts.find(
    (f) => f.semanticKey === 'DATA_CONFLICT.ROAD_STATUS_CONFLICT',
  );
  if (conflict && typeof conflict.value === 'object' && conflict.value) {
    const roadId = (conflict.value as { roadId?: string }).roadId;
    if (typeof roadId === 'string' && roadId.trim()) {
      return roadId.trim().toUpperCase();
    }
  }

  return undefined;
}

export function tryBuildLookRoadSuspectedClosedHint(input: {
  lookObservationId: string;
  tripId: string;
  facts: ObservationFact[];
  segmentId?: string;
  suspectedAt?: string;
  /** Fallback when facts lack an explicit road id */
  fallbackRoadId?: string;
}): LookRoadSuspectedClosedHint | null {
  const suspected = input.facts.some(isLookRoadClosedSuspectedFact);
  if (!suspected) return null;

  const roadId =
    extractRelatedRoadIdFromLookFacts(input.facts) ??
    input.fallbackRoadId?.toUpperCase();
  if (!roadId) return null;

  return buildLookRoadSuspectedClosedHint({
    lookObservationId: input.lookObservationId,
    roadId,
    tripId: input.tripId,
    segmentId: input.segmentId,
    suspectedAt: input.suspectedAt,
  });
}
