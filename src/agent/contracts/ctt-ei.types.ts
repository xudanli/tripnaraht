/**
 * CTT-EI — Causal Type Theory for Execution Intelligence.
 *
 * Runtime-facing contracts for **typed causal judgements**: Φ well-formedness, dual 𝒪 slices,
 * ε as residual type witness, SPCL as refinement signal, ECPS as mode selection from ε-geometry.
 *
 * This is not a full proof assistant — it is **structural validation + typed witnesses** that
 * OFDL/COFT-EI programs can satisfy or violate.
 */

import type { CausalFieldSnapshot } from './multi-agent-causal-field.types';
import type { SpclErrorBundle, SpclObservationSample } from './shadow-policy-calibration.types';

export const CTT_EI_SCHEMA = 'ctt-ei/v1' as const;

/** Judgement witness — “⊢ J” realized as pass/fail + reasons. */
export interface CttJudgement<T = unknown> {
  readonly holds: boolean;
  readonly witness?: T;
  readonly violations: string[];
}

/** Φ carrier — today `CausalFieldSnapshot`; ValidState is established by judgement, not branding alone. */
export type StateFieldPhi = CausalFieldSnapshot;

/** ε witness — paired ΔΦ plus scalar summary (SPCL bundle). */
export interface ResidualFieldWitness {
  sample: SpclObservationSample;
  bundle: SpclErrorBundle;
}

/** Low / high operator-divergence regions (former SYSTEM1 / SYSTEM2 as type geography). */
export type CttSystemTier = 'SYSTEM1' | 'SYSTEM2' | 'INTER_REGION';

export interface CttEpsilonThresholds {
  /** ||ε|| below → SYSTEM1-style low-divergence region. */
  tauLow: number;
  /** ||ε|| at or above → SYSTEM2-style reconstruction band. */
  tauHigh: number;
}

/** Replay must preserve consecutive valid Φ typing (temporal consistency stub). */
export interface ReplayTypingJudgement {
  preservesParticleLattice: boolean;
  consecutiveStructuralValidity: boolean;
}
