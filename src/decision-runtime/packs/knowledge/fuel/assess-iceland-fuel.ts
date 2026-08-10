/**
 * Iceland FuelAssessment engine — dynamic reserve, never pretend when unknown.
 */

import type { SourceReference } from '../iceland-knowledge.types';
import type {
  FuelAssessment,
  FuelAssessmentStatus,
  FuelRecommendedAction,
  IcelandFuelAssessmentInput,
  IcelandFuelPolicy,
  IcelandFuelRemoteness,
  IcelandFuelReliability,
  IcelandFuelStationAlongRoute,
  IcelandFuelStationProfile,
} from './iceland-fuel.types';
import { loadIcelandFuelPolicy } from './iceland-fuel.loader';

function supportsFuelType(
  station: IcelandFuelStationProfile,
  needed: IcelandFuelAssessmentInput['fuelTypeNeeded'],
): boolean {
  return station.fuelTypes.includes(needed);
}

function isStationUsable(
  station: IcelandFuelStationProfile,
  needed: IcelandFuelAssessmentInput['fuelTypeNeeded'],
): boolean {
  if (station.unavailable) return false;
  return supportsFuelType(station, needed);
}

function pickStations(
  stationsAhead: IcelandFuelStationAlongRoute[],
  needed: IcelandFuelAssessmentInput['fuelTypeNeeded'],
): {
  primary?: IcelandFuelStationAlongRoute;
  fallback?: IcelandFuelStationAlongRoute;
  usable: IcelandFuelStationAlongRoute[];
} {
  const usable = stationsAhead
    .filter((s) => isStationUsable(s.profile, needed))
    .slice()
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return { primary: usable[0], fallback: usable[1], usable };
}

function resolveRemoteness(
  input: IcelandFuelAssessmentInput,
  primary?: IcelandFuelStationAlongRoute,
): IcelandFuelRemoteness {
  return input.corridorRemoteness ?? primary?.profile.remotenessLevel ?? 'REMOTE';
}

function computeReserveKm(
  policy: IcelandFuelPolicy,
  remoteness: IcelandFuelRemoteness,
  reliability: IcelandFuelReliability,
  openingUnknown: boolean,
): number {
  let reserve =
    policy.baseReserveKm +
    policy.remotenessReserveKm[remoteness] +
    policy.reliabilityReserveKm[reliability];
  if (openingUnknown) {
    reserve += policy.unknownOpeningReserveKm;
  }
  return reserve;
}

function applyConsumptionMultipliers(
  distanceKm: number,
  policy: IcelandFuelPolicy,
  input: IcelandFuelAssessmentInput,
): number {
  const weather =
    policy.weatherMultipliers[input.weatherBand ?? 'default'] ??
    policy.weatherMultipliers.default;
  const road =
    policy.roadMultipliers[input.roadBand ?? 'default'] ??
    policy.roadMultipliers.default;
  const detour = Math.max(0, input.detourExtraKm ?? 0);
  return distanceKm * weather * road + detour;
}

function policyEvidence(policy: IcelandFuelPolicy): SourceReference[] {
  return [
    {
      kind: 'PACK_FILE',
      path: 'knowledge/fuel/is-fuel-policy.json',
      version: policy.version,
    },
  ];
}

function stationEvidence(station?: IcelandFuelStationProfile): SourceReference[] {
  if (!station) return [];
  return station.sourceRefs.length > 0
    ? station.sourceRefs
    : [
        {
          kind: 'PACK_FILE',
          path: 'knowledge/fuel/is-fuel-station-profiles.json',
          note: station.poiId,
        },
      ];
}

function buildAssessment(params: {
  status: FuelAssessmentStatus;
  estimatedRangeKm: number;
  requiredRangeKm: number;
  reserveRangeKm: number;
  nextPrimaryStation?: string;
  fallbackStation?: string;
  assumptions: string[];
  evidence: SourceReference[];
  recommendedAction?: FuelRecommendedAction;
  reasons: string[];
}): FuelAssessment {
  return { ...params };
}

/**
 * Core FuelAssessment. Pure function — policy injectable for tests.
 */
export function assessIcelandFuel(
  input: IcelandFuelAssessmentInput,
  policy: IcelandFuelPolicy = loadIcelandFuelPolicy(),
): FuelAssessment {
  const estimatedRangeKm = Math.max(0, input.estimatedRangeKm);
  const evidenceBase = policyEvidence(policy);
  const assumptions: string[] = [
    `weatherBand=${input.weatherBand ?? 'default'}`,
    `roadBand=${input.roadBand ?? 'default'}`,
    `fuelTypeNeeded=${input.fuelTypeNeeded}`,
  ];

  if (!input.stationsAhead.length) {
    if (policy.allUnknownBlocks) {
      return buildAssessment({
        status: 'BLOCK',
        estimatedRangeKm,
        requiredRangeKm: input.plannedSegmentKm ?? Number.POSITIVE_INFINITY,
        reserveRangeKm: policy.baseReserveKm + policy.remotenessReserveKm.REMOTE,
        assumptions: [...assumptions, 'no_stations_ahead'],
        evidence: evidenceBase,
        recommendedAction: 'REPLAN_ROUTE',
        reasons: ['NO_STATION_DATA', 'REFUSE_FAKE_EXECUTABLE'],
      });
    }
  }

  const allUnknown =
    input.stationsAhead.length > 0 &&
    input.stationsAhead.every(
      (s) =>
        s.profile.reliability === 'UNKNOWN' &&
        s.profile.openingMode === 'UNKNOWN',
    );

  if (allUnknown && policy.allUnknownBlocks) {
    const nearest = [...input.stationsAhead].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    return buildAssessment({
      status: 'BLOCK',
      estimatedRangeKm,
      requiredRangeKm: nearest
        ? applyConsumptionMultipliers(nearest.distanceKm, policy, input) +
          policy.baseReserveKm +
          policy.remotenessReserveKm.REMOTE +
          policy.reliabilityReserveKm.UNKNOWN +
          policy.unknownOpeningReserveKm
        : Number.POSITIVE_INFINITY,
      reserveRangeKm:
        policy.baseReserveKm +
        policy.remotenessReserveKm.REMOTE +
        policy.reliabilityReserveKm.UNKNOWN,
      nextPrimaryStation: nearest?.profile.poiId,
      assumptions: [...assumptions, 'all_station_facts_unknown'],
      evidence: [...evidenceBase, ...stationEvidence(nearest?.profile)],
      recommendedAction: 'REFUEL_NOW',
      reasons: ['ALL_STATION_DATA_UNKNOWN', 'REFUSE_FAKE_EXECUTABLE'],
    });
  }

  const { primary, fallback } = pickStations(
    input.stationsAhead,
    input.fuelTypeNeeded,
  );

  if (!primary) {
    const anyAhead = [...input.stationsAhead].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const unavailablePrimary = input.stationsAhead.find(
      (s) => s.profile.unavailable || !supportsFuelType(s.profile, input.fuelTypeNeeded),
    );
    return buildAssessment({
      status: 'BLOCK',
      estimatedRangeKm,
      requiredRangeKm: anyAhead
        ? applyConsumptionMultipliers(anyAhead.distanceKm, policy, input) +
          policy.baseReserveKm
        : input.plannedSegmentKm ?? Number.POSITIVE_INFINITY,
      reserveRangeKm: policy.baseReserveKm + policy.remotenessReserveKm.REMOTE,
      nextPrimaryStation: unavailablePrimary?.profile.poiId ?? anyAhead?.profile.poiId,
      assumptions: [...assumptions, 'no_usable_station_for_fuel_type'],
      evidence: [...evidenceBase, ...stationEvidence(unavailablePrimary?.profile)],
      recommendedAction: policy.recommendedActions.insufficientRange,
      reasons: ['NO_USABLE_STATION', 'FUEL_TYPE_OR_AVAILABILITY'],
    });
  }

  const remoteness = resolveRemoteness(input, primary);
  const openingUnknown = primary.profile.openingMode === 'UNKNOWN';
  const reserveRangeKm = computeReserveKm(
    policy,
    remoteness,
    primary.profile.reliability,
    openingUnknown,
  );

  const adjustedDistanceKm = applyConsumptionMultipliers(
    primary.distanceKm,
    policy,
    input,
  );
  const requiredRangeKm = adjustedDistanceKm + reserveRangeKm;

  const evidence = [
    ...evidenceBase,
    ...stationEvidence(primary.profile),
    ...stationEvidence(fallback?.profile),
  ];

  assumptions.push(
    `primary=${primary.profile.poiId}`,
    `primaryDistanceKm=${primary.distanceKm}`,
    `adjustedDistanceKm=${adjustedDistanceKm}`,
    `remoteness=${remoteness}`,
    `reliability=${primary.profile.reliability}`,
    `openingMode=${primary.profile.openingMode}`,
  );

  const nearestRaw = [...input.stationsAhead].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const nearestWasUnusable =
    !!nearestRaw &&
    (nearestRaw.profile.unavailable === true ||
      !supportsFuelType(nearestRaw.profile, input.fuelTypeNeeded));
  const switchedToAlternative =
    nearestWasUnusable && nearestRaw!.profile.poiId !== primary.profile.poiId;

  if (switchedToAlternative) {
    if (estimatedRangeKm >= requiredRangeKm) {
      return buildAssessment({
        status: 'WARN',
        estimatedRangeKm,
        requiredRangeKm,
        reserveRangeKm,
        nextPrimaryStation: primary.profile.poiId,
        fallbackStation: fallback?.profile.poiId,
        assumptions: [...assumptions, 'primary_replaced_by_fallback'],
        evidence,
        recommendedAction: policy.recommendedActions.primaryUnavailableWithFallback,
        reasons: ['PRIMARY_UNAVAILABLE', 'FALLBACK_AVAILABLE'],
      });
    }
    return buildAssessment({
      status: 'BLOCK',
      estimatedRangeKm,
      requiredRangeKm,
      reserveRangeKm,
      nextPrimaryStation: nearestRaw!.profile.poiId,
      fallbackStation: primary.profile.poiId,
      assumptions: [...assumptions, 'fallback_out_of_range'],
      evidence,
      recommendedAction: 'REPLAN_ROUTE',
      reasons: ['PRIMARY_UNAVAILABLE', 'FALLBACK_OUT_OF_RANGE'],
    });
  }

  if (estimatedRangeKm < requiredRangeKm) {
    const detourExhausts =
      (input.detourExtraKm ?? 0) > 0 || input.roadBand === 'detour';
    return buildAssessment({
      status: 'BLOCK',
      estimatedRangeKm,
      requiredRangeKm,
      reserveRangeKm,
      nextPrimaryStation: primary.profile.poiId,
      fallbackStation: fallback?.profile.poiId,
      assumptions,
      evidence,
      recommendedAction: detourExhausts
        ? policy.recommendedActions.detourExhaustsRange
        : policy.recommendedActions.insufficientRange,
      reasons: detourExhausts
        ? ['DETOUR_EXHAUSTS_RANGE', 'INSUFFICIENT_RANGE']
        : ['INSUFFICIENT_RANGE_TO_RELIABLE_STATION'],
    });
  }

  if (openingUnknown || primary.profile.reliability === 'UNKNOWN') {
    return buildAssessment({
      status: 'WARN',
      estimatedRangeKm,
      requiredRangeKm,
      reserveRangeKm,
      nextPrimaryStation: primary.profile.poiId,
      fallbackStation: fallback?.profile.poiId,
      assumptions: [...assumptions, 'uncertain_station_operating_state'],
      evidence,
      recommendedAction: policy.recommendedActions.unknownOpening,
      reasons: openingUnknown
        ? ['NEXT_STATION_OPENING_UNKNOWN']
        : ['NEXT_STATION_RELIABILITY_UNKNOWN'],
    });
  }

  if (
    primary.profile.reliability === 'PARTIALLY_VERIFIED' ||
    remoteness === 'REMOTE' ||
    (input.weatherBand && input.weatherBand !== 'default')
  ) {
    return buildAssessment({
      status: 'PASS',
      estimatedRangeKm,
      requiredRangeKm,
      reserveRangeKm,
      nextPrimaryStation: primary.profile.poiId,
      fallbackStation: fallback?.profile.poiId,
      assumptions: [...assumptions, 'elevated_reserve_applied'],
      evidence,
      reasons: ['WITHIN_DYNAMIC_RESERVE'],
    });
  }

  return buildAssessment({
    status: 'PASS',
    estimatedRangeKm,
    requiredRangeKm,
    reserveRangeKm,
    nextPrimaryStation: primary.profile.poiId,
    fallbackStation: fallback?.profile.poiId,
    assumptions,
    evidence,
    reasons: ['RANGE_SUFFICIENT'],
  });
}

/** Apply Iceland policy multipliers onto a generic VehicleFuelProfile-style envelope. */
export function applyIcelandFuelPolicyToVehicleProfile(
  base: {
    nominalRangeKm: number;
    safetyMarginPct: number;
    worstCaseMultiplier: number;
  },
  policy: IcelandFuelPolicy,
  opts?: {
    remoteness?: IcelandFuelRemoteness;
    weatherBand?: IcelandFuelAssessmentInput['weatherBand'];
    roadBand?: IcelandFuelAssessmentInput['roadBand'];
  },
): {
  nominalRangeKm: number;
  safetyMarginPct: number;
  worstCaseMultiplier: number;
  derivedReserveKm: number;
} {
  const remoteness = opts?.remoteness ?? 'RURAL';
  const reserveKm =
    policy.baseReserveKm + policy.remotenessReserveKm[remoteness];
  const weather =
    policy.weatherMultipliers[opts?.weatherBand ?? 'default'] ??
    policy.weatherMultipliers.default;
  const road =
    policy.roadMultipliers[opts?.roadBand ?? 'default'] ??
    policy.roadMultipliers.default;
  const reserveAsPct =
    base.nominalRangeKm > 0
      ? Math.min(0.45, Math.max(base.safetyMarginPct, reserveKm / base.nominalRangeKm))
      : base.safetyMarginPct;

  return {
    nominalRangeKm: base.nominalRangeKm,
    safetyMarginPct: reserveAsPct,
    worstCaseMultiplier: Math.max(1, base.worstCaseMultiplier * weather * road),
    derivedReserveKm: reserveKm,
  };
}
