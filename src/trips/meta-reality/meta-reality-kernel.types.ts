/**
 * P21 — Meta-reality kernel: no single fixed world; only generable reality candidates.
 */

import type { CausalitySemantics, TimeSemantics, ExecutionPhysicsModel } from '../execution-physics/execution-physics.types';

export interface BootstrapRule {
  id: string;
  description: string;
  priority: number;
}

export type RealityCollapseMode = 'DETERMINISTIC' | 'PROBABILISTIC' | 'MULTI_BRANCH_PERSISTED';

export interface RealitySelectionPhysics {
  entropyBias: number;
  stabilityWeight: number;
  utilityWeight: number;
  collapseMode: RealityCollapseMode;
}

export interface StabilityConstraint {
  id: string;
  /** Minimum acceptable stability score [0,1] under kernel policy. */
  minStability: number;
  /** Optional entropy ceiling before rejection in filtering passes. */
  maxEntropy?: number;
}

export interface RealitySeed {
  seedId: string;
  timePhysics: TimeSemantics;
  causalityPhysics: CausalitySemantics;
  executionSemantics: ExecutionPhysicsModel;

  probabilityWeight: number;

  /** Collapse-time observables — typically estimated after sandbox scoring. */
  stabilityScore?: number;
  executionUtility?: number;
  driftPenalty?: number;
}

export interface MetaRealityKernel {
  realitySeeds: RealitySeed[];
  bootstrapRules: BootstrapRule[];
  selectionPhysics: RealitySelectionPhysics;
  stabilityConstraints: StabilityConstraint[];
}
