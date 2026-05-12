/**
 * P4-A Route Execution Semantics — leg-level rollup from corridor segments.
 *
 * Travel edge = physical executable edge (not only distance + ETA).
 */

import type { ExecutionState, VehicleClass } from '../../decision/hazard/travel-hazard.types';

/** DEM / slope / surface composite difficulty (distinct from weather severity). */
export type RouteTerrainDifficulty = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';

export interface RouteExecutionAssessment {
  legId: string;
  terrainDifficulty: RouteTerrainDifficulty;
  weatherExposure: {
    crosswindRisk?: number;
    snowExposure?: number;
    whiteoutProbability?: number;
  };
  roadAccessibility: {
    fRoad: boolean;
    requires4WD?: boolean;
    seasonalClosureRisk?: number;
  };
  /** 0–1 aggregate corridor reliability (higher = more predictable execution). */
  executionReliability: number;
  /** Multiplier vs ideal conditions (≥ 1). */
  estimatedDelayFactor: number;
  recommendedVehicleClass?: VehicleClass;
  executionState: ExecutionState;
}
