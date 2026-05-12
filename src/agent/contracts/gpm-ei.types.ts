/**
 * GPM-EI — Geometric Proof Manifold for Execution Intelligence (discrete realization).
 *
 * ℳ_𝒪 is represented operationally by **Kθ identification** + **state trajectories** τ in Φ-space.
 * ε_geom approximates manifold separation between exec vs shadow paths (not full Riemannian distance).
 */

import type { CausalInteractionKernel } from './multi-agent-causal-field.types';

export const GPM_EI_SCHEMA = 'gpm-ei/v1' as const;
export const GPM_EI_TRAJECTORY_WITNESS_SCHEMA = 'gpm-ei/trajectory-witness/v1' as const;

/** Point on ℳ_𝒪 — today a labeled kernel instance (learnable geometry anchor). */
export interface OperatorManifoldPoint {
  kernelFingerprint: string;
  causalKernel: CausalInteractionKernel;
}

/** ECPS hook: how “non-geodesic” a path may be before SYSTEM2-style retargeting. */
export interface GeodesicPathBudget {
  /** Max RMS ε_geom between exec and shadow paths before hard divergence (toy scale). */
  maxEpsilonGeomRms: number;
  /** Soft cap on discrete path energy ∑‖ΔΦ‖² along exec trajectory. */
  maxExecGeodesicEnergy?: number;
}

/** Witness bundling discrete geometric proxies for τ_exec vs τ_shadow. */
export interface GpmTrajectoryWitness {
  schema: typeof GPM_EI_TRAJECTORY_WITNESS_SCHEMA;
  epsilonGeomRms: number;
  execGeodesicEnergy: number;
  shadowGeodesicEnergy: number;
  /** Root-mean step drift along exec chain (local curvature proxy). */
  execMeanStepNorm: number;
  shadowMeanStepNorm: number;
}
