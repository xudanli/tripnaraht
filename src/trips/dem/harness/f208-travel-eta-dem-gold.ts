/**
 * Iceland travel-eta + DEM gold matrix — Route ETA + terrain + F-road gate.
 * Uses production L2 adjuster (applyIcelandPlanningEtaAdjustment) for regression.
 */

import {
  projectLegacyDurationToEtaEnvelope,
  type TravelEtaEnvelopeV1,
  type TravelSegmentTerrainV1,
} from '../../../transport/contracts/travel-eta.contract';
import { applyIcelandPlanningEtaAdjustment } from '../../../transport/services/iceland-planning-eta-adjustment.util';
import { terrainToDemDecisionEvidence } from '../utils/map-travel-terrain.util';
import type { DemDecisionEvidence } from '../../decision/interfaces/dem-decision-evidence.interface';

export const F208_GOLD_POIS = {
  west: { id: 'poi-is-f208-west', lat: 64.0, lng: -19.2, name: 'F208 West (Hrauneyjar area)' },
  east: { id: 'poi-is-f208-east', lat: 64.3, lng: -19.8, name: 'F208 East (Kerlingarfjöll approach)' },
} as const;

/** Ring-road coastal anchors (paved — must not get highland F-road buffer) */
export const RING_ROAD_GOLD_POIS = {
  vik: { id: 'poi-is-vik', lat: 63.42, lng: -19.01, name: 'Vík' },
  kirkjubaejarklaustur: {
    id: 'poi-is-kirkjubaejarklaustur',
    lat: 63.79,
    lng: -18.05,
    name: 'Kirkjubæjarklaustur',
  },
} as const;

export const F208_GOLD_SEGMENT_ID = 'seg-is-f208';
export const F208_ROAD_ID = 'F208';

export type F208GoldVehicle = '2WD' | '4WD';
export type F208GoldRoadStatus = 'OPEN' | 'SEASONAL' | 'CLOSED';
export type F208GoldDecision = 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'REJECT';

export interface F208TravelEtaDemGoldInput {
  baseDurationMin: number;
  distanceM: number;
  terrain: TravelSegmentTerrainV1;
  vehicle: F208GoldVehicle;
  roadStatus: F208GoldRoadStatus;
  month: number;
  provider?: TravelEtaEnvelopeV1['provenance']['provider'];
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  pavedRingRoad?: boolean;
  highlandRisk?: boolean;
  roadId?: string;
}

export interface F208TravelEtaDemGoldResult {
  decision: F208GoldDecision;
  reasons: string[];
  eta: TravelEtaEnvelopeV1;
  demEvidence: DemDecisionEvidence;
  roadId: string;
  segmentId: typeof F208_GOLD_SEGMENT_ID;
  vehicleOk: boolean;
  summary: {
    baseDurationMin: number;
    planningDurationMin: number;
    schedulableDurationMin: number;
    ascentM: number;
    maxSlopePct: number;
    demSource: string;
  };
}

/**
 * Compose planning ETA (L2) + DEM evidence + F-road vehicle/season gate.
 */
export function evaluateF208TravelEtaDemGold(
  input: F208TravelEtaDemGoldInput,
): F208TravelEtaDemGoldResult {
  const roadId = input.roadId ?? F208_ROAD_ID;
  const origin = input.origin ?? F208_GOLD_POIS.west;
  const destination = input.destination ?? F208_GOLD_POIS.east;

  const base = projectLegacyDurationToEtaEnvelope({
    durationMin: input.baseDurationMin,
    distanceM: input.distanceM,
    sourceKind: 'ROUTE_API',
    provider: input.provider ?? 'MAPBOX',
    geometry: {
      encoding: 'ENCODED_POLYLINE',
      value: 'f208_gold_polyline',
      source: 'ROUTE_API',
      pointCount: 2,
    },
    confidence: 0.85,
  });

  const l2 = applyIcelandPlanningEtaAdjustment({
    baseEta: { ...base, terrain: input.terrain },
    origin,
    destination,
    vehicle: input.vehicle,
    roadStatus: input.roadStatus,
    roadId: input.pavedRingRoad ? undefined : roadId,
    isFRoad: !input.pavedRingRoad && roadId.startsWith('F'),
    highlandRisk: input.highlandRisk,
    month: input.month,
    terrain: input.terrain,
    authority: 'SHADOW',
    pavedRingRoad: input.pavedRingRoad,
  });

  const demEvidence = terrainToDemDecisionEvidence({
    segmentId: F208_GOLD_SEGMENT_ID,
    terrain: input.terrain,
  });

  const reasons = [...l2.reasons];
  if (demEvidence.violation === 'HARD') reasons.push('HARD_DEM_VIOLATION');
  else if (demEvidence.violation === 'SOFT') reasons.push('DEM_SOFT_UNCERTAINTY');

  // Align CLOSED reason label with historical gold
  if (input.roadStatus === 'CLOSED' && !reasons.includes('ROAD_CLOSED_F208') && roadId === 'F208') {
    reasons.push('ROAD_CLOSED_F208');
  }
  if (input.roadStatus === 'CLOSED' && l2.decision === 'SUGGEST_REPLACE') {
    reasons.push('REROUTE_OFF_F208');
  }

  const vehicleOk = input.vehicle === '4WD' || !!input.pavedRingRoad;

  return {
    decision: l2.decision,
    reasons: [...new Set(reasons)],
    eta: l2.eta,
    demEvidence,
    roadId,
    segmentId: F208_GOLD_SEGMENT_ID,
    vehicleOk,
    summary: {
      baseDurationMin: l2.eta.baseDurationMin,
      planningDurationMin: l2.eta.planningDurationMin,
      schedulableDurationMin: l2.eta.schedulableDurationMin,
      ascentM: input.terrain.ascentM,
      maxSlopePct: input.terrain.maxSlopePct,
      demSource: input.terrain.demSource,
    },
  };
}

export function f208GoldSummer4wdAllowFixture(terrain: TravelSegmentTerrainV1): F208TravelEtaDemGoldInput {
  return {
    baseDurationMin: 125,
    distanceM: 95_000,
    terrain,
    vehicle: '4WD',
    roadStatus: 'OPEN',
    month: 7,
    provider: 'MAPBOX',
  };
}

export function f208Gold2wdRejectFixture(terrain: TravelSegmentTerrainV1): F208TravelEtaDemGoldInput {
  return {
    ...f208GoldSummer4wdAllowFixture(terrain),
    vehicle: '2WD',
  };
}

/** Paved ring-road control — must not inflate with highland F-road buffer */
export function ringRoadPavedControlFixture(terrain: TravelSegmentTerrainV1): F208TravelEtaDemGoldInput {
  return {
    baseDurationMin: 90,
    distanceM: 75_000,
    terrain: {
      ...terrain,
      ascentM: 120,
      descentM: 100,
      maxSlopePct: 4,
      avgSlopePct: 1.5,
    },
    vehicle: '2WD',
    roadStatus: 'OPEN',
    month: 7,
    provider: 'MAPBOX',
    origin: RING_ROAD_GOLD_POIS.vik,
    destination: RING_ROAD_GOLD_POIS.kirkjubaejarklaustur,
    pavedRingRoad: true,
    roadId: 'Route1',
  };
}

/** Highland corridor with global DEM fallback */
export function highlandGlobalDemFixture(terrain: TravelSegmentTerrainV1): F208TravelEtaDemGoldInput {
  return {
    ...f208GoldSummer4wdAllowFixture({
      ...terrain,
      demSource: 'geo_dem_global',
      confidence: 0.4,
      resolutionM: 30,
    }),
    highlandRisk: true,
  };
}
