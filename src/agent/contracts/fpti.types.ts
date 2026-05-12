/**
 * FPTI — Fixed Point Theory of Intelligence (discrete observability layer).
 *
 * Execution dynamics F : (S, 𝒪, 𝒞) ↦ (S', 𝒪', 𝒞') — stability when repeated application
 * lands in a neighborhood of structurally equivalent Ω (OCT triple).
 */

export const FPTI_SCHEMA = 'fpti/v1' as const;
export const FPTI_TRAJECTORY_SCHEMA = 'fpti/trajectory-witness/v1' as const;

export type FptiFailureMode = 'NONE' | 'DIVERGENCE' | 'OSCILLATION' | 'COLLAPSE';

/** Classification of a finite Φ-trajectory under toy guards. */
export interface FptiTrajectoryWitness {
  schema: typeof FPTI_TRAJECTORY_SCHEMA;
  failureMode: FptiFailureMode;
  notes: string[];
}

/** ECPS-style basin hint — near attractor vs needs re-entry. */
export type FptiConvergenceBasin = 'IN_ATTRACTOR' | 'OUTSIDE_ATTRACTOR';

/** Witness that Ω sequence admits an approximate fixed point (min pairwise residual below τ). */
export interface FptiFixedPointWitness {
  admitsApproximateFixedPoint: boolean;
  minimumStructuralResidual: number;
  tailLengthConsidered: number;
}
