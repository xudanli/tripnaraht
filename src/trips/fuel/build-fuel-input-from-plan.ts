import type { TripPlan } from '../decision/plan-model';
import type { TripWorldState } from '../decision/world-model';
import type { FuelPolylineInput, FuelPoiIndexEntry, VehicleFuelProfile } from './fuel-reachability.types';
import { computeFuelReachability } from './compute-fuel-reachability';
import type { FuelReachabilitySummary } from './fuel-reachability.types';

export const DEFAULT_VEHICLE_FUEL_PROFILE: VehicleFuelProfile = {
  nominalRangeKm: 480,
  safetyMarginPct: 0.12,
  worstCaseMultiplier: 1.18,
};

/**
 * Builds corridor legs from plan drive segments only — no OSM polyline yet.
 * When no FUEL POIs carry `arcKmAlongRoute`, kmToNext defaults to 0 (optimistic / urban stub).
 */
export function buildFuelPolylineFromPlan(plan: TripPlan): FuelPolylineInput {
  let cumulative = 0;
  const legs: FuelPolylineInput['legs'] = [];

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const tl = slot.travelLegFromPrev;
      if (!tl || tl.mode !== 'drive') {
        continue;
      }
      const distanceKm = typeof tl.distanceKm === 'number' && tl.distanceKm > 0 ? tl.distanceKm : 0;
      if (distanceKm <= 0) {
        continue;
      }
      cumulative += distanceKm;
      legs.push({
        id: slot.id,
        date: day.date,
        cumulativeKmToLegEnd: cumulative,
        kmToNextFuel: 0,
        distanceKm,
      });
    }
  }

  return { legs };
}

function looksLikeFuelCandidate(c: {
  type?: string;
  intentTags?: string[];
  name?: { zh?: string; en?: string };
}): boolean {
  const tags = (c.intentTags ?? []).join(' ').toLowerCase();
  const name = `${c.name?.en ?? ''} ${c.name?.zh ?? ''}`.toLowerCase();
  if (tags.includes('fuel') || tags.includes('gas') || tags.includes('petrol')) {
    return true;
  }
  if (/\b(fuel|gas|petrol|加油站|油站)\b/i.test(name)) {
    return true;
  }
  return c.type === 'transport' && tags.includes('station');
}

/**
 * Pull FUEL-like candidates from the world pool (arc distances optional until OSM corridor lands).
 */
export function extractFuelPoiIndexFromCandidates(
  candidatesByDate: TripWorldState['candidatesByDate'],
): FuelPoiIndexEntry[] {
  const out: FuelPoiIndexEntry[] = [];
  const seen = new Set<string>();

  for (const day of Object.keys(candidatesByDate)) {
    for (const c of candidatesByDate[day] ?? []) {
      if (!looksLikeFuelCandidate(c) || !c.location?.point) {
        continue;
      }
      if (seen.has(c.id)) {
        continue;
      }
      seen.add(c.id);
      out.push({
        id: c.id,
        category: 'FUEL',
        lat: c.location.point.lat,
        lng: c.location.point.lng,
      });
    }
  }

  return out;
}

export function summarizeFuelReachabilityForPlan(
  plan: TripPlan,
  poiIndex: FuelPoiIndexEntry[],
  vehicle: VehicleFuelProfile,
): Partial<Record<string, FuelReachabilitySummary>> {
  const polyline = buildFuelPolylineFromPlan(plan);
  if (polyline.legs.length === 0) {
    return {};
  }

  const rows = computeFuelReachability({
    polyline,
    poiIndex,
    vehicleProfile: vehicle,
  });

  const byId: Partial<Record<string, FuelReachabilitySummary>> = {};
  for (const r of rows) {
    byId[r.legId] = r;
  }
  return byId;
}
