import type { TravelObservationEvent } from '../observation.types';
import type { GroundingHints, RoadMatchKind } from './grounding.types';

/**
 * Match OCR road id to GPS / nearby roads.
 * Reykjavik-ish vs highland F-road → CONFLICT when OCR shows F-road.
 */
export function groundRoadMatch(input: {
  event: TravelObservationEvent;
  detectedRoadId?: string;
  hints: GroundingHints;
}): { kind: RoadMatchKind; notes: string[] } {
  const notes: string[] = [];
  const { event, detectedRoadId, hints } = input;
  const lat = event.spatialContext.latitude;
  const lng = event.spatialContext.longitude;
  const hasGps = typeof lat === 'number' && typeof lng === 'number';

  if (!detectedRoadId) {
    return { kind: hasGps ? 'NO_ROAD_ID' : 'NO_GPS', notes };
  }

  if (!hasGps) {
    return { kind: 'NO_GPS', notes: ['GPS missing — cannot match road segment'] };
  }

  const accuracy = event.spatialContext.accuracyMeters ?? 999;
  if (accuracy > 100) {
    notes.push(`GPS accuracy ${accuracy}m is weak`);
  }

  const nearby = (hints.nearbyRoadIds ?? []).map((r) => r.toUpperCase());
  const planned = (hints.plannedRoadIds ?? []).map((r) => r.toUpperCase());
  const id = detectedRoadId.toUpperCase();

  // Image vs location conflict: F-road sign but coordinates look like capital area
  if (/^F\d+/.test(id) && isLikelyCapitalArea(lat!, lng!)) {
    notes.push('F-road OCR vs capital-area GPS — IMAGE_LOCATION_MISMATCH');
    return { kind: 'CONFLICT', notes };
  }

  if (nearby.includes(id) || planned.includes(id)) {
    notes.push(`Road ${id} matched nearby/planned context`);
    return { kind: 'MATCHED', notes };
  }

  // Highlands-ish GPS + F-road OCR without explicit nearby list → soft match
  if (/^F\d+/.test(id) && isLikelyHighlandArea(lat!, lng!)) {
    notes.push(`F-road ${id} consistent with highland GPS (soft match)`);
    return { kind: 'MATCHED', notes };
  }

  if (nearby.length > 0 || planned.length > 0) {
    notes.push(`Road ${id} not in nearby/planned set`);
    return { kind: 'UNMATCHED', notes };
  }

  notes.push(`Road ${id} observed; no nearby catalog — unverified match`);
  return { kind: 'UNMATCHED', notes };
}

/** Approx Reykjavik / SW coast */
export function isLikelyCapitalArea(lat: number, lng: number): boolean {
  return lat > 63.9 && lat < 64.3 && lng > -22.5 && lng < -21.3;
}

/** Rough interior / highland band used for soft F-road corroboration */
export function isLikelyHighlandArea(lat: number, lng: number): boolean {
  return lat > 63.7 && lat < 65.2 && lng > -20.5 && lng < -17.5;
}
