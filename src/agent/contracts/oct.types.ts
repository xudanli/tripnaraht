/**
 * OCT — Ontological Compression Theory (minimal generating grammar).
 *
 * Irreducible triple Ω = ⟨S, 𝒪, 𝒞⟩:
 * - **S** — state carrier (one Φ snapshot).
 * - **𝒪** — operator carrier (Kθ fingerprint + projection / modal modes).
 * - **𝒞** — consistency witness (obligations satisfiable under evolution).
 *
 * Higher layers (ECUS, MCUT, PCCS, …) **project** onto this triple; OCT does not add a new runtime tier.
 */

import type { CausalFieldSnapshot, CausalInteractionKernel } from './multi-agent-causal-field.types';
import type { OfdlProjectionMode } from './ofdl.types';

export const OCT_SCHEMA = 'oct/v1' as const;
export const OCT_UNIVERSE_SCHEMA = 'oct/universe/v1' as const;

/** Named axioms — documentation only; semantics enforced via witnesses. */
export const OCT_AXIOMS = [
  'A1_STATE_EXISTENCE',
  'A2_OPERATOR_CAUSALITY',
  'A3_CONSTRAINT_CONSERVATION',
] as const;

/** S — existential witness on concrete Φ. */
export interface OctStateWitness {
  phi: CausalFieldSnapshot;
}

/** 𝒪 — causal operator family witness (no dynamics step here — projection labels only). */
export interface OctOperatorWitness {
  kernelFingerprint: string;
  execMode: OfdlProjectionMode;
  shadowMode: 'SHADOW';
  /** Optional full Kθ when available from the embedding layer. */
  causalKernel?: CausalInteractionKernel;
}

/** 𝒞 — constraint conservation witness (π_proof / triadic / sheaf obligations collapse here). */
export interface OctConstraintWitness {
  holds: boolean;
  obligationsSatisfied: string[];
  violations: string[];
}

/** Ω — compressed ontological universe snapshot. */
export interface OntologicalTriple {
  schema: typeof OCT_UNIVERSE_SCHEMA;
  S: OctStateWitness;
  O: OctOperatorWitness;
  C: OctConstraintWitness;
}
