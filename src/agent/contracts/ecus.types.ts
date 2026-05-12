/**
 * ECUS — Epistemic-Causal Universe Synthesis (discrete runtime model).
 *
 * 𝒰 ≈ ⟨𝔅, K, R⟩: belief masses over world ids, shared causal kernel Kθ, modal reachability **R**
 * realized via MCUT accessibility witnesses between anchored worlds.
 */

import type { CausalInteractionKernel } from './multi-agent-causal-field.types';

export const ECUS_SCHEMA = 'ecus/v1' as const;
export const ECUS_TRIADIC_WITNESS_SCHEMA = 'ecus/triadic-witness/v1' as const;

/** 𝔅 — nonnegative masses over modal world identifiers (normalized by helpers). */
export interface EpistemicMassDistribution {
  masses: Record<string, number>;
}

/** One 𝒰 slice — beliefs + causal carrier K; R evaluated pairwise via MCUT when worlds are supplied. */
export interface EcusUniverseState {
  schema: typeof ECUS_SCHEMA;
  beliefs: EpistemicMassDistribution;
  causalKernel: CausalInteractionKernel;
}

/** Replay / SPCL triadic check — exec vs shadow 𝒰 alignment. */
export interface EcusTriadicConsistencyWitness {
  schema: typeof ECUS_TRIADIC_WITNESS_SCHEMA;
  beliefL1Distance: number;
  kernelAligned: boolean;
  modalReachabilityAligned: boolean;
  triadicallyConsistent: boolean;
}

export type EcusEpistemicTier = 'EPISTEMIC_LOCAL' | 'EPISTEMIC_REVISION';
