import type { UnifiedPhysicsField } from './unified-physics-field.types';

/**
 * P-Next 1.2 — State-vector normalization contract: all scalars ∈ [0, 1], deterministic transforms only.
 * Bump when mapping formulas change (migration / replay audits).
 */
export const PHYSICS_FIELD_NORMALIZATION_VERSION = '1' as const;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function clampUncertainty(u: NonNullable<UnifiedPhysicsField['uncertainty']>) {
  return {
    weatherVariance: clamp01(u.weatherVariance),
    routeVolatility: clamp01(u.routeVolatility),
    fuelEstimateError: clamp01(u.fuelEstimateError),
    temporalDrift: clamp01(u.temporalDrift),
  };
}

/** Defensive re-clamp after any upstream drift — keeps replay/hash stable when formulas evolve. */
export function normalizeUnifiedPhysicsField(field: UnifiedPhysicsField): UnifiedPhysicsField {
  return {
    ...field,
    stateVector: {
      mobility: clamp01(field.stateVector.mobility),
      exposure: clamp01(field.stateVector.exposure),
      energy: clamp01(field.stateVector.energy),
      temporalPressure: clamp01(field.stateVector.temporalPressure),
    },
    ...(field.uncertainty ? { uncertainty: clampUncertainty(field.uncertainty) } : {}),
  };
}
