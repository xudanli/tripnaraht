/**
 * P-Next 8 — One perturbation of the physical field space relative to a base index row / template.
 */

import type { UnifiedPhysicsField } from '../physics/unified-physics-field.types';

/** Deep-partial friendly patch — `stateVector` keys are additive deltas. */
export type CounterfactualPhysicsPatch = {
  stateVector?: Partial<UnifiedPhysicsField['stateVector']>;
  uncertainty?: Partial<NonNullable<UnifiedPhysicsField['uncertainty']>>;
  derived?: UnifiedPhysicsField['derived'];
};

export interface CounterfactualBranch {
  branchId: string;
  /**
   * Applied per leg via delta-merge on `stateVector` (additive on normalized axes).
   */
  modifiedPhysics: CounterfactualPhysicsPatch;
  /** Prior over this branch for expected-regret weighting (sums need not be 1 — normalized at selection). */
  probabilityWeight: number;
  /** Source replica id or logical lineage tag (`base`, `consensus`, …). */
  derivedFrom: string;
}
