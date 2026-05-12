/**
 * P-Next 3 — Materialize overlay frames as **execution trace**: observed outcome fields are copied from
 * {@link PhysicsFieldIndex}, not from fusion-time `finalExecutionState`.
 */

import type { ExecutionState } from '../decision/hazard/travel-hazard.types';
import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { UnifiedPhysicsDerivedState } from '../physics/unified-physics-field.types';
import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';
import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';

function mapDerivedToObservedOutcome(d: UnifiedPhysicsDerivedState): ExecutionState {
  switch (d) {
    case 'IMPASSABLE':
      return 'BLOCKED';
    case 'UNSTABLE':
      return 'HIGH_RISK';
    case 'DEGRADED':
      return 'DEGRADED';
    case 'STABLE':
      return 'EXECUTABLE';
  }
}

function reliabilityFromPhysicsField(field: UnifiedPhysicsField): number {
  const { mobility, exposure, energy, temporalPressure } = field.stateVector;
  return Math.max(
    0.08,
    Math.min(1, 0.25 * mobility + 0.25 * (1 - exposure) + 0.25 * energy + 0.25 * (1 - temporalPressure)),
  );
}

/**
 * Overwrites per-leg `finalExecutionState` / `reliabilityScore` from physics index rows.
 * Preserves fusion labels on `annotations.legacyFusionExecutionState` when applying for the first time.
 */
export function applyPhysicsAuthorityToOverlayFrames(
  frames: ExecutionOverlayFrame[],
  index: PhysicsFieldIndex,
): ExecutionOverlayFrame[] {
  return frames.map(frame => {
    const field = index.byLegId[frame.legId];
    if (!field) {
      return frame;
    }

    const legacyFusion =
      frame.annotations?.legacyFusionExecutionState ?? frame.finalExecutionState;

    return {
      ...frame,
      finalExecutionState: mapDerivedToObservedOutcome(field.derived),
      reliabilityScore: reliabilityFromPhysicsField(field),
      annotations: {
        ...frame.annotations,
        physicsAuthorityApplied: true,
        legacyFusionExecutionState: legacyFusion,
        physicsDerived: field.derived,
      },
    };
  });
}
