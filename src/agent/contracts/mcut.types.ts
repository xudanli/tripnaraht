/**
 * MCUT — Modal Causal Universe Theory (discrete runtime model).
 *
 * Each **world** bundles one Φ snapshot with one Kθ carrier — a “possible causal universe” slice.
 * **Accessibility** is approximated by geometric / symbolic divergence (not Kripke semantics in full).
 * **Transition kernel** is a normalized score proxy for P(W₂ | W₁, 𝒪).
 */

import type { CausalFieldSnapshot, CausalInteractionKernel } from './multi-agent-causal-field.types';

export const MCUT_SCHEMA = 'mcut/v1' as const;
export const MCUT_WORLD_SCHEMA = 'mcut/world/v1' as const;

/** Wᵢ ≈ (Φ, 𝒪-family via tags, Kθ) — operator realized elsewhere (OFDL mode / certificate). */
export interface CausalWorld {
  schema: typeof MCUT_WORLD_SCHEMA;
  worldId: string;
  phi: CausalFieldSnapshot;
  causalKernel: CausalInteractionKernel;
}

/** R(Wᵢ → Wⱼ) witness — high accessibilityScore ⇒ “near possible world” (SYSTEM1-like). */
export interface AccessibilityWitness {
  phiDivergenceRms: number;
  kernelAligned: boolean;
  /** Combined divergence — φ distance plus penalty if Kθ fingerprints differ. */
  structuralDivergence: number;
  /** ∈ [0,1], higher = directly accessible modal step. */
  accessibilityScore: number;
  accessibleUnderThreshold: boolean;
}

export interface ModalTransitionKernelSample {
  /** Normalized mass on arriving at `to` from `from` under discrete operator label. */
  probabilityMass: number;
  operatorTag: string;
}

/** ECPS modal router partition (stub carriers for SYSTEM1 / SYSTEM2 bands). */
export type ModalExecutionBand = 'NEAR_WORLD' | 'FAR_WORLD' | 'INACCESSIBLE';
