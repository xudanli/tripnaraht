/**
 * Travel time heuristic v0 — conservative Iceland-oriented defaults when routing API absent.
 * Does not replace SmartRoutes; attaches explicit factors so planners can converge on one ETA story.
 */

import type { TravelMode } from '../world-model';
import {
  TRAVEL_TIME_ONTOLOGY_SCHEMA,
  type TravelRoadNetworkClass,
  type TravelSeasonHint,
  type TravelTimeEstimateV1,
  type TravelTimeFactorBreakdownV1,
  type TravelTimeInputsResolvedV1,
  type TravelWeatherBucket,
} from './travel-time-ontology.types';

export interface TravelTimeHeuristicV0Input {
  distanceKm: number;
  mode: TravelMode;
  season?: TravelSeasonHint;
  roadNetworkClass?: TravelRoadNetworkClass;
  weatherBucket?: TravelWeatherBucket;
}

/** Implied km/h before weather / daylight / fatigue multipliers (v0: only weather applied). */
export function impliedSpeedKmhV0(input: TravelTimeHeuristicV0Input): number {
  const { mode, season = 'unknown', roadNetworkClass = 'unknown' } = input;
  if (mode === 'walk') {
    return 5;
  }
  if (mode === 'bike') {
    return 15;
  }
  if (mode !== 'drive' && mode !== 'unknown') {
    // transit etc. — keep moderate until dedicated tables exist
    return 35;
  }

  const road: TravelRoadNetworkClass = roadNetworkClass;
  if (road === 'f_road' || road === 'gravel') {
    if (season === 'winter') return 35;
    if (season === 'summer') return 45;
    return 40;
  }
  // paved / mixed / unknown → conservative generic highway-ish
  if (season === 'winter') return 50;
  if (season === 'summer') return 60;
  return 50;
}

function weatherMultiplier(w: TravelWeatherBucket | undefined): number {
  switch (w) {
    case 'adverse':
      return 1.15;
    case 'blocked_signal':
      return 1.35;
    case 'clear':
      return 1;
    default:
      return 1;
  }
}

export function estimateTravelTimeHeuristicV0(input: TravelTimeHeuristicV0Input): TravelTimeEstimateV1 {
  const speed = impliedSpeedKmhV0(input);
  const wMult = weatherMultiplier(input.weatherBucket);
  const rawMinutes = (input.distanceKm / speed) * 60 * wMult;
  const pointEstimateMinutes = Math.max(5, Math.round(rawMinutes));

  const degradedWorldModel =
    input.season === undefined ||
    input.roadNetworkClass === undefined ||
    input.weatherBucket === undefined;

  const inputsResolved: TravelTimeInputsResolvedV1 = {
    season: input.season ?? 'unknown',
    roadNetworkClass: input.roadNetworkClass ?? 'unknown',
    weatherBucket: input.weatherBucket ?? 'unknown',
  };

  const factors: TravelTimeFactorBreakdownV1 = {
    baseDistanceKm: input.distanceKm,
    impliedAvgSpeedKmh: speed,
    weatherDelayMultiplier: wMult,
  };

  return {
    schema: TRAVEL_TIME_ONTOLOGY_SCHEMA,
    pointEstimateMinutes,
    provenance: 'HEURISTIC_SPEED_MODEL',
    inputsResolved,
    factors,
    degradedWorldModel,
    legSourceHint: 'heuristic',
  };
}

/**
 * Provider-returned duration — wraps API minutes with explicit routing provenance.
 */
export function wrapRoutingProviderMinutes(params: {
  durationMinutes: number;
  distanceKm?: number;
  sourceLabel: string;
  degradedWorldModel?: boolean;
}): TravelTimeEstimateV1 {
  return {
    schema: TRAVEL_TIME_ONTOLOGY_SCHEMA,
    pointEstimateMinutes: Math.max(1, Math.round(params.durationMinutes)),
    provenance: 'ROUTING_PROVIDER',
    inputsResolved: {
      season: 'unknown',
      roadNetworkClass: 'unknown',
      weatherBucket: 'unknown',
    },
    factors: {
      baseDistanceKm: params.distanceKm,
    },
    degradedWorldModel: params.degradedWorldModel ?? true,
    legSourceHint: params.sourceLabel,
  };
}
