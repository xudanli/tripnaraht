/**
 * P-Next 1 — Unified physics field: single state-space projection over mobility / exposure / energy / temporal pressure.
 *
 * Consumption layer reads this vector instead of competing per-domain penalties (overlay remains raw input).
 */

export type UnifiedPhysicsDerivedState = 'STABLE' | 'DEGRADED' | 'UNSTABLE' | 'IMPASSABLE';

export type UnifiedPhysicsSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * P-Next 7 — Epistemic envelope over the leg projection (all normalized 0–1 where applicable).
 * Absent fields imply zero extra uncertainty contribution at consensus time.
 */
export interface PhysicsUncertaintyEnvelope {
  weatherVariance: number;
  routeVolatility: number;
  fuelEstimateError: number;
  temporalDrift: number;
}

export interface UnifiedPhysicsField {
  legId: string;
  date: string;

  stateVector: {
    /** 0–1 — cumulative mobility / corridor reliability (road × terrain envelope). */
    mobility: number;
    /** 0–1 — atmospheric + circadian exposure stress (weather × daylight coupling). */
    exposure: number;
    /** 0–1 — remaining energy envelope vs nominal (fuel remaining ratio). */
    energy: number;
    /** 0–1 normalized schedule tension (sequence drift + cross-day spill proxy). */
    temporalPressure: number;
  };

  constraints: {
    blocked: boolean;
    severity: UnifiedPhysicsSeverity;
  };

  derived: UnifiedPhysicsDerivedState;

  /** P-Next 7 — multi-source / multi-time alignment; used by consensus penalty, not physics derivation. */
  uncertainty?: PhysicsUncertaintyEnvelope;
}
