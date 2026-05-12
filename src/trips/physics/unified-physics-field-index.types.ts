import type { UnifiedPhysicsDerivedState, UnifiedPhysicsField } from './unified-physics-field.types';

/** Leg ids grouped by derived phase — O(1) bucket append at build time; stable query for Neptune / policies. */
export type PhysicsFieldBucketsByDerivedState = Record<UnifiedPhysicsDerivedState, string[]>;

/**
 * P-Next 1.1 — Decision-time lookup plane over projected physics (supplements overlay scan with indexed access).
 */
export interface PhysicsFieldIndex {
  byLegId: Record<string, UnifiedPhysicsField>;

  /** Calendar day → all legs touching that date (order = compilation order). */
  byDate: Record<string, UnifiedPhysicsField[]>;

  byState: PhysicsFieldBucketsByDerivedState;
}
