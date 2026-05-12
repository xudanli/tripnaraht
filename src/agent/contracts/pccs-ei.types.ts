/**
 * PCCS-EI — Proof-Carrying Causal System for Execution Intelligence.
 *
 * Each observable transition ships as **ExecutionCertificate**: Φ_exec / Φ_shadow, ε witness,
 * π_proof (checkable obligation bundle), and Kθ trace — not merely values + small error.
 */

import type { CausalFieldSnapshot } from './multi-agent-causal-field.types';
import type { OfdlProjectionMode } from './ofdl.types';
import type { SpclErrorBundle, SpclObservationSample } from './shadow-policy-calibration.types';

export const PCCS_EI_CERTIFICATE_SCHEMA = 'pccs-ei/execution-certificate/v1' as const;
export const PCCS_EI_PROOF_SCHEMA = 'pccs-ei/proof/v1' as const;

/** Scalar audit trail for which Kθ produced the dual projections. */
export interface KthetaTrace {
  kernelFingerprint: string;
  execMode: OfdlProjectionMode;
  shadowMode: 'SHADOW';
}

/** Obligation surface checked when constructing π_proof (stub constraints → future formal proofs). */
export interface PccsConstraintSurface {
  cmaftNcgesDualConsistency: boolean;
  spclEpsilonBounded: boolean;
  cttStateTyping: boolean;
  residualWellFormed: boolean;
}

export type PccsProofComplexity = 'SHORT' | 'FULL';

/**
 * π_proof — verifiable witness bundle (not a theorem prover): satisfied obligations + violations.
 * SHORT ≈ low-divergence + all surface checks; FULL ≈ repair / reconstruction path.
 */
export interface PccsProofWitness {
  schema: typeof PCCS_EI_PROOF_SCHEMA;
  holds: boolean;
  obligationsSatisfied: string[];
  violations: string[];
  constraintSurface: PccsConstraintSurface;
  proofComplexity: PccsProofComplexity;
}

/** 𝒞 — proof-carrying execution record. */
export interface ExecutionCertificate {
  schema: typeof PCCS_EI_CERTIFICATE_SCHEMA;
  phiExec: CausalFieldSnapshot;
  phiShadow: CausalFieldSnapshot;
  epsilon: SpclErrorBundle;
  piProof: PccsProofWitness;
  kThetaTrace: KthetaTrace;
  spclSample: SpclObservationSample;
}

export interface PccsCertificateOptions {
  /** If maxAbs(ε) exceeds this, π_proof records SPCL unbounded obligation failure. */
  spclMaxAbsEpsilon?: number;
}
