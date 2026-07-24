/**
 * Map TravelSegmentTerrainV1 (eta.terrain) → RoutePlanDraft physics + DemDecisionEvidence.
 * Bridge Gate 2 → CGUS / Abu without re-querying DEM.
 */

import type { TravelSegmentTerrainV1 } from '../../../transport/contracts/travel-eta.contract';
import { isTravelEtaEnvelopeV1 } from '../../../transport/contracts/travel-eta.contract';
import type { DemDecisionEvidence } from '../../decision/interfaces/dem-decision-evidence.interface';

export function extractTerrainFromItemMetadata(
  metadata: unknown,
): TravelSegmentTerrainV1 | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const travelEta = (metadata as Record<string, unknown>).travelEta;
  if (isTravelEtaEnvelopeV1(travelEta) && travelEta.terrain) {
    return travelEta.terrain;
  }
  const direct = (metadata as Record<string, unknown>).terrain;
  if (direct && typeof direct === 'object') {
    const t = direct as TravelSegmentTerrainV1;
    if (typeof t.ascentM === 'number' && typeof t.maxSlopePct === 'number') {
      return t;
    }
  }
  return undefined;
}

export function applyTerrainToSegmentPhysics(terrain: TravelSegmentTerrainV1): {
  ascentM: number;
  slopePct: number;
} {
  return {
    ascentM: Math.max(0, Math.round(terrain.ascentM)),
    slopePct: Math.max(0, Number(terrain.maxSlopePct) || Number(terrain.avgSlopePct) || 0),
  };
}

/**
 * Build DemDecisionEvidence from Gate-2 terrain for Abu / physical.demEvidence.
 * HARD when highland DEM missing (confidence 0 / source NONE) or extreme slope.
 */
export function terrainToDemDecisionEvidence(input: {
  segmentId: string;
  terrain: TravelSegmentTerrainV1;
  /** Soft threshold for max slope % (default 25) */
  hardMaxSlopePct?: number;
  /** Soft threshold for single-segment ascent (default 1200m) */
  hardMaxAscentM?: number;
}): DemDecisionEvidence {
  const { segmentId, terrain } = input;
  const hardMaxSlopePct = input.hardMaxSlopePct ?? 25;
  const hardMaxAscentM = input.hardMaxAscentM ?? 1200;

  let violation: DemDecisionEvidence['violation'] = 'NONE';
  const reasons: string[] = [];

  if (terrain.demSource === 'NONE' || terrain.confidence <= 0) {
    violation = 'HARD';
    reasons.push('DEM_SOURCE_MISSING');
  } else if (
    terrain.demSource === 'geo_dem_global' &&
    terrain.geometrySource === 'ROUTE_API' &&
    terrain.confidence < 0.7
  ) {
    violation = 'SOFT';
    reasons.push('DEM_GLOBAL_FALLBACK_ON_ROUTE');
  }

  if (terrain.maxSlopePct > hardMaxSlopePct) {
    violation = 'HARD';
    reasons.push(`MAX_SLOPE_${terrain.maxSlopePct}`);
  }
  if (terrain.ascentM > hardMaxAscentM) {
    violation = 'HARD';
    reasons.push(`ASCENT_${terrain.ascentM}M`);
  }

  return {
    segmentId,
    elevationProfile: [],
    cumulativeAscent: terrain.ascentM,
    maxSlopePct: terrain.maxSlopePct,
    rollingAscent3Days: terrain.ascentM,
    fatigueIndex: Math.min(100, Math.round(terrain.ascentM / 20 + terrain.maxSlopePct)),
    violation,
    explanation:
      reasons.length > 0
        ? `Terrain gate: ${reasons.join(', ')} (demSource=${terrain.demSource})`
        : `Terrain OK: ascent ${terrain.ascentM}m, maxSlope ${terrain.maxSlopePct}% via ${terrain.demSource}`,
    dataProvenance:
      terrain.demSource === 'geo_dem_iceland_20m'
        ? 'LIVE'
        : terrain.demSource === 'NONE'
          ? 'NONE'
          : 'STATIC_INFERRED',
    metadata: {
      avgSlopePct: terrain.avgSlopePct,
      elevationRange: undefined,
    },
  };
}
