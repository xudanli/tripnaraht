import type { ExecutionTruthDAG } from '../../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import type { PhysicsFieldIndex } from '../../physics/unified-physics-field-index.types';

/**
 * P-Next 2 — Decision switch-over routing (physics index vs overlay vs DAG-only fallback).
 * Does **not** bypass IR/VM; callers merge triggers then run existing Neptune repair loop.
 */
export type NeptuneDecisionMode = 'PHYSICS_FIRST' | 'OVERLAY_LEGACY' | 'DAG_FALLBACK';

export interface NeptuneDecisionRouterInput {
  physicsFieldIndex?: PhysicsFieldIndex | null;
  executionOverlayFrames?: ExecutionOverlayFrame[] | null;
  executionTruthDAG?: ExecutionTruthDAG | null;
}

export function routeDecisionContext(input: NeptuneDecisionRouterInput): NeptuneDecisionMode {
  const hasPhysics =
    input.physicsFieldIndex != null &&
    Object.keys(input.physicsFieldIndex.byLegId).length > 0;

  if (hasPhysics) {
    return 'PHYSICS_FIRST';
  }

  if (input.executionOverlayFrames?.length) {
    return 'OVERLAY_LEGACY';
  }

  if (input.executionTruthDAG?.nodes?.length) {
    return 'DAG_FALLBACK';
  }

  return 'DAG_FALLBACK';
}
