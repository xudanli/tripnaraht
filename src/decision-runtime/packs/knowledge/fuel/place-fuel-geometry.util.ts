/**
 * Geometry helpers for Iceland fuel hydrate.
 * Corridor arc assignment delegates to trips/fuel corridor projection (distanceKm-aligned).
 */

import { haversineKm } from '../../../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import type { TripPlan } from '../../../../trips/decision/plan-model';
import type { GeoPoint } from '../../../../trips/decision/world-model';
import type { FuelPoiIndexEntry } from '../../../../trips/fuel/fuel-reachability.types';
import {
  assignFuelArcsAlongCorridor,
  buildDriveCorridorSegments,
  projectFuelPoiOntoCorridor,
} from '../../../../trips/fuel/project-fuel-poi-onto-corridor';
import type {
  IcelandFuelAssessmentInput,
  IcelandFuelStationAlongRoute,
  IcelandFuelStationProfile,
} from './iceland-fuel.types';

export {
  assignFuelArcsAlongCorridor,
  buildDriveCorridorSegments,
  projectFuelPoiOntoCorridor,
};

/** @deprecated Prefer assignFuelArcsAlongCorridor — kept as alias for callers. */
export function assignApproximateFuelArcsFromPlan(
  plan: TripPlan,
  pois: FuelPoiIndexEntry[],
  options?: { maxSnapKm?: number; denserCoordinates?: ReadonlyArray<GeoPoint> },
): FuelPoiIndexEntry[] {
  return assignFuelArcsAlongCorridor(plan, pois, options);
}

/**
 * Build stationsAhead from corridor arcs when available.
 */
export function buildStationsAheadFromCorridorArcs(opts: {
  plan: TripPlan;
  profiles: IcelandFuelStationProfile[];
  cumulativeKm: number;
  maxStations?: number;
  maxSnapKm?: number;
}): IcelandFuelStationAlongRoute[] {
  const segments = buildDriveCorridorSegments(opts.plan);
  if (segments.length === 0) return [];

  const ranked: IcelandFuelStationAlongRoute[] = [];
  for (const profile of opts.profiles) {
    if (typeof profile.lat !== 'number' || typeof profile.lng !== 'number') continue;
    const hit = projectFuelPoiOntoCorridor(
      { lat: profile.lat, lng: profile.lng },
      segments,
      opts.maxSnapKm ?? 30,
    );
    if (!hit) continue;
    if (hit.arcKmAlongRoute <= opts.cumulativeKm) continue;
    ranked.push({
      profile,
      distanceKm: hit.arcKmAlongRoute - opts.cumulativeKm,
    });
  }
  ranked.sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked.slice(0, opts.maxStations ?? 8);
}

/**
 * Legacy endpoint haversine ranking — only when corridor projection yields nothing.
 */
export function buildStationsAheadFromPlanGeometry(opts: {
  plan: TripPlan;
  profiles: IcelandFuelStationProfile[];
  maxStations?: number;
}): IcelandFuelStationAlongRoute[] {
  const segments = buildDriveCorridorSegments(opts.plan);
  const last = segments[segments.length - 1];
  if (!last) return [];

  const ranked: IcelandFuelStationAlongRoute[] = [];
  for (const profile of opts.profiles) {
    if (typeof profile.lat !== 'number' || typeof profile.lng !== 'number') continue;
    const distanceKm = haversineKm(
      last.to.lat,
      last.to.lng,
      profile.lat,
      profile.lng,
    );
    ranked.push({ profile, distanceKm });
  }
  ranked.sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked.slice(0, opts.maxStations ?? 8);
}

export function fuelProfilesToPoiIndex(
  profiles: IcelandFuelStationProfile[],
): FuelPoiIndexEntry[] {
  return profiles
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({
      id: s.poiId,
      category: 'FUEL' as const,
      lat: s.lat as number,
      lng: s.lng as number,
    }));
}

export type { IcelandFuelAssessmentInput };
