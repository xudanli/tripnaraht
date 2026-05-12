/**
 * P-Next 8 — Apply counterfactual deltas and re-derive phase + severity (overlay-less).
 */

import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import type { CounterfactualPhysicsPatch } from './physics-branch.types';
import {
  computeSeverity,
  deriveUnifiedState,
} from '../physics/build-unified-physics-field';
import { normalizeUnifiedPhysicsField } from '../physics/physics-field-normalization';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Mirrors private helper in build-unified-physics-field — keeps CF semantics aligned. */
function blockedFromScalars(mobility: number, exposure: number, energy: number): boolean {
  return mobility < 0.3 || energy < 0.15 || exposure > 0.8;
}

/**
 * Additive deltas on stateVector (missing components = 0 delta). Recomputes `derived` / `constraints`.
 */
export function applyCounterfactualDelta(
  base: UnifiedPhysicsField,
  delta: CounterfactualPhysicsPatch,
): UnifiedPhysicsField {
  const sv = base.stateVector;
  const d = delta.stateVector;
  const mobility = clamp01(sv.mobility + (d?.mobility ?? 0));
  const exposure = clamp01(sv.exposure + (d?.exposure ?? 0));
  const energy = clamp01(sv.energy + (d?.energy ?? 0));
  const temporalPressure = clamp01(sv.temporalPressure + (d?.temporalPressure ?? 0));

  const blocked = blockedFromScalars(mobility, exposure, energy);
  const derived = deriveUnifiedState(
    blocked,
    mobility,
    exposure,
    energy,
    temporalPressure,
    false,
  );
  const severity = computeSeverity(mobility, exposure, energy);

  const mergedUncertainty =
    delta.uncertainty !== undefined || base.uncertainty !== undefined
      ? {
          weatherVariance: clamp01(
            delta.uncertainty?.weatherVariance ?? base.uncertainty?.weatherVariance ?? 0,
          ),
          routeVolatility: clamp01(
            delta.uncertainty?.routeVolatility ?? base.uncertainty?.routeVolatility ?? 0,
          ),
          fuelEstimateError: clamp01(
            delta.uncertainty?.fuelEstimateError ?? base.uncertainty?.fuelEstimateError ?? 0,
          ),
          temporalDrift: clamp01(
            delta.uncertainty?.temporalDrift ?? base.uncertainty?.temporalDrift ?? 0,
          ),
        }
      : undefined;

  const raw: UnifiedPhysicsField = {
    ...base,
    legId: base.legId,
    date: base.date,
    stateVector: { mobility, exposure, energy, temporalPressure },
    constraints: {
      blocked: derived === 'IMPASSABLE',
      severity,
    },
    derived,
    ...(mergedUncertainty ? { uncertainty: mergedUncertainty } : {}),
  };
  return normalizeUnifiedPhysicsField(raw);
}
