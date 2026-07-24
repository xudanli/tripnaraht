/**
 * Prefer Gate-2 travel-eta.terrain already stamped on ItineraryItems
 * when building WorldModel physical.demEvidence (Abu path).
 */

import {
  extractTerrainFromItemMetadata,
  terrainToDemDecisionEvidence,
} from '../../../trips/dem/utils/map-travel-terrain.util';
import type { DemDecisionEvidence } from '../../../trips/decision/interfaces/dem-decision-evidence.interface';

type TripDayLike = {
  ItineraryItem?: Array<{
    id?: string;
    metadata?: unknown;
  }>;
};

/**
 * Walk trip days/items; collect DemDecisionEvidence from metadata.travelEta.terrain.
 * Returns [] when no stamped terrain (caller falls back to live DEM / placeholder).
 */
export function collectDemEvidenceFromTripTerrain(
  trip: { TripDay?: TripDayLike[] } | null | undefined,
  options?: { tripId?: string },
): DemDecisionEvidence[] {
  if (!trip?.TripDay?.length) return [];

  const out: DemDecisionEvidence[] = [];
  for (const day of trip.TripDay) {
    for (const item of day.ItineraryItem ?? []) {
      const terrain = extractTerrainFromItemMetadata(item.metadata);
      if (!terrain) continue;
      const segmentId =
        item.id != null
          ? `item_${item.id}`
          : `trip_${options?.tripId ?? 'unknown'}_terrain_${out.length}`;
      out.push(
        terrainToDemDecisionEvidence({
          segmentId,
          terrain,
        }),
      );
    }
  }
  return out;
}
