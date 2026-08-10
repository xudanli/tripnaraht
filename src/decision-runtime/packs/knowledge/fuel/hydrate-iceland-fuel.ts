/**
 * Planning / execution hydrate helper — Iceland fuel profiles + policy into P-FUEL-1 signals.
 * Place DB stations are projected at runtime (read-only); pack seed remains corridor fallback.
 */

import {
  DEFAULT_VEHICLE_FUEL_PROFILE,
  buildFuelPolylineFromPlan,
  extractFuelPoiIndexFromCandidates,
  summarizeFuelReachabilityForPlan,
} from '../../../../trips/fuel/build-fuel-input-from-plan';
import { computeEffectiveRangeKm } from '../../../../trips/fuel/compute-fuel-reachability';
import type {
  FuelPoiIndexEntry,
  FuelReachabilitySummary,
  VehicleFuelProfile,
} from '../../../../trips/fuel/fuel-reachability.types';
import type { TripPlan } from '../../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../../trips/decision/world-model';
import {
  applyIcelandFuelPolicyToVehicleProfile,
  assessIcelandFuel,
} from './assess-iceland-fuel';
import { fuelAssessmentToReachabilitySummary } from './fuel-assessment-bridge';
import {
  icelandFuelStationsAsPoiIndex,
  loadIcelandFuelPolicy,
  loadIcelandFuelStationProfiles,
} from './iceland-fuel.loader';
import type {
  FuelAssessment,
  IcelandFuelAssessmentInput,
  IcelandFuelStationProfile,
} from './iceland-fuel.types';
import {
  assignFuelArcsAlongCorridor,
  buildStationsAheadFromCorridorArcs,
  buildStationsAheadFromPlanGeometry,
  fuelProfilesToPoiIndex,
} from './place-fuel-geometry.util';

export interface IcelandFuelHydrateResult {
  fuelReachabilityByLegId: Partial<Record<string, FuelReachabilitySummary>>;
  corridorAssessment?: FuelAssessment;
  vehicleProfileUsed: VehicleFuelProfile;
  /** How many Place-projected stations were merged (0 when DB unused). */
  placeStationCount?: number;
}

function mergePoiIndex(
  ...lists: FuelPoiIndexEntry[][]
): FuelPoiIndexEntry[] {
  const seen = new Set<string>();
  const out: FuelPoiIndexEntry[] = [];
  for (const list of lists) {
    for (const s of list) {
      if (seen.has(s.id)) continue;
      out.push(s);
      seen.add(s.id);
    }
  }
  return out;
}

function mergeProfiles(
  pack: IcelandFuelStationProfile[],
  place: IcelandFuelStationProfile[],
): IcelandFuelStationProfile[] {
  const byId = new Map<string, IcelandFuelStationProfile>();
  for (const s of pack) byId.set(s.poiId, s);
  for (const s of place) {
    // Place ids are place:N — never collide with pack seed ids; Place wins on same id
    byId.set(s.poiId, s);
  }
  return [...byId.values()];
}

/**
 * When candidate/seed POIs carry arcKmAlongRoute, build a corridor FuelAssessment
 * from the given cumulative position.
 */
export function assessCorridorFromPoiArcs(opts: {
  cumulativeKm: number;
  estimatedRangeKm: number;
  fuelTypeNeeded?: IcelandFuelAssessmentInput['fuelTypeNeeded'];
  poiIndex: FuelPoiIndexEntry[];
  profiles?: IcelandFuelStationProfile[];
  weatherBand?: IcelandFuelAssessmentInput['weatherBand'];
  roadBand?: IcelandFuelAssessmentInput['roadBand'];
  detourExtraKm?: number;
}): FuelAssessment | undefined {
  const profiles =
    opts.profiles ?? loadIcelandFuelStationProfiles().stations;
  const byId = new Map(profiles.map((p) => [p.poiId, p]));
  const stationsAhead = opts.poiIndex
    .filter(
      (p) =>
        typeof p.arcKmAlongRoute === 'number' &&
        (p.arcKmAlongRoute as number) > opts.cumulativeKm &&
        byId.has(p.id),
    )
    .map((p) => ({
      profile: byId.get(p.id)!,
      distanceKm: (p.arcKmAlongRoute as number) - opts.cumulativeKm,
    }));

  if (stationsAhead.length === 0) {
    return undefined;
  }

  return assessIcelandFuel({
    estimatedRangeKm: opts.estimatedRangeKm,
    fuelTypeNeeded: opts.fuelTypeNeeded ?? 'PETROL',
    stationsAhead,
    weatherBand: opts.weatherBand,
    roadBand: opts.roadBand,
    detourExtraKm: opts.detourExtraKm,
  });
}

export function hydrateIcelandFuelForPlan(opts: {
  plan: TripPlan;
  candidatesByDate: TripWorldState['candidatesByDate'];
  vehicleProfile?: VehicleFuelProfile;
  weatherBand?: IcelandFuelAssessmentInput['weatherBand'];
  roadBand?: IcelandFuelAssessmentInput['roadBand'];
  /** Runtime Place projections — read-only; not written back to DB */
  placeStations?: IcelandFuelStationProfile[];
  /** Optional denser corridor vertices (decoded route polyline), trip order */
  denserCoordinates?: ReadonlyArray<{ lat: number; lng: number }>;
}): IcelandFuelHydrateResult {
  const policy = loadIcelandFuelPolicy();
  const base = opts.vehicleProfile ?? DEFAULT_VEHICLE_FUEL_PROFILE;
  const adjusted = applyIcelandFuelPolicyToVehicleProfile(base, policy, {
    remoteness: 'RURAL',
    weatherBand: opts.weatherBand,
    roadBand: opts.roadBand,
  });
  const vehicleProfileUsed: VehicleFuelProfile = {
    nominalRangeKm: adjusted.nominalRangeKm,
    safetyMarginPct: adjusted.safetyMarginPct,
    worstCaseMultiplier: adjusted.worstCaseMultiplier,
  };

  const placeStations = opts.placeStations ?? [];
  const packProfiles = loadIcelandFuelStationProfiles().stations;
  const allProfiles = mergeProfiles(packProfiles, placeStations);

  const pois = assignFuelArcsAlongCorridor(
    opts.plan,
    mergePoiIndex(
      extractFuelPoiIndexFromCandidates(opts.candidatesByDate),
      fuelProfilesToPoiIndex(placeStations),
      icelandFuelStationsAsPoiIndex(),
    ),
    {
      maxSnapKm: 30,
      denserCoordinates: opts.denserCoordinates,
    },
  );

  let fuelReachabilityByLegId = summarizeFuelReachabilityForPlan(
    opts.plan,
    pois,
    vehicleProfileUsed,
  );

  const polyline = buildFuelPolylineFromPlan(opts.plan);
  const lastLeg = polyline.legs[polyline.legs.length - 1];
  let corridorAssessment: FuelAssessment | undefined;

  if (lastLeg) {
    const effective = computeEffectiveRangeKm(vehicleProfileUsed);
    const remaining = Math.max(0, effective - lastLeg.cumulativeKmToLegEnd);
    corridorAssessment = assessCorridorFromPoiArcs({
      cumulativeKm: lastLeg.cumulativeKmToLegEnd,
      estimatedRangeKm: remaining,
      poiIndex: pois,
      profiles: allProfiles,
      weatherBand: opts.weatherBand,
      roadBand: opts.roadBand,
    });

    // Prefer corridor-arc stationsAhead when poiIndex arcs did not yield assessment
    if (!corridorAssessment && allProfiles.length > 0) {
      const fromArcs = buildStationsAheadFromCorridorArcs({
        plan: opts.plan,
        profiles: allProfiles,
        cumulativeKm: lastLeg.cumulativeKmToLegEnd,
      });
      const stationsAhead =
        fromArcs.length > 0
          ? fromArcs
          : buildStationsAheadFromPlanGeometry({
              plan: opts.plan,
              profiles: allProfiles,
            });
      if (stationsAhead.length > 0) {
        corridorAssessment = assessIcelandFuel({
          estimatedRangeKm: remaining,
          fuelTypeNeeded: 'PETROL',
          stationsAhead,
          weatherBand: opts.weatherBand,
          roadBand: opts.roadBand,
        });
      }
    }

    if (corridorAssessment && corridorAssessment.status !== 'PASS') {
      fuelReachabilityByLegId = {
        ...fuelReachabilityByLegId,
        [lastLeg.id]: fuelAssessmentToReachabilitySummary(corridorAssessment, {
          legId: lastLeg.id,
          date: lastLeg.date,
        }),
      };
    }
  }

  return {
    fuelReachabilityByLegId,
    corridorAssessment,
    vehicleProfileUsed,
    placeStationCount: placeStations.length,
  };
}
