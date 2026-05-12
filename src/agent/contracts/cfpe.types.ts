/**
 * CFPE — Constructive Fixed Point Engineering (runtime verification hooks).
 *
 * Contractive / closure / repair constraints evaluated on finite Φ trajectories and optional PCCS 𝒞 witness.
 * Reference attractor Φ* must be supplied by design (nominal fixed point target).
 */

export const CFPE_SCHEMA = 'cfpe/v1' as const;
export const CFPE_ENGINEERING_WITNESS_SCHEMA = 'cfpe/engineering-witness/v1' as const;

/** Combined constructive constraints toward designed convergence. */
export interface CfpeEngineeringWitness {
  schema: typeof CFPE_ENGINEERING_WITNESS_SCHEMA;
  contractionSatisfied: boolean;
  closureSatisfied: boolean;
  repairChannelAvailable: boolean;
  /** Last step ratio ‖Φₜ−Φ*‖ / ‖Φₜ₋₁−Φ*‖ when prior distance > 0; null if undefined. */
  tailContractionRatio: number | null;
  /** Heuristic: shadow path energy ≤ exec path energy (+ tol) ⇒ linear surrogate is contraction envelope. */
  shadowEnvelopeConsistent: boolean | null;
}

/** SYSTEM1 = constraints jointly satisfied (inside designed basin). */
export type CfpeSystemTier = 'SYSTEM1_CFPE' | 'SYSTEM2_CFPE';
