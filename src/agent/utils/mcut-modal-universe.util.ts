/**
 * MCUT — worlds, accessibility, alignment (SPCL), equivalence (replay).
 */

import type { CausalInteractionKernel, CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type {
  AccessibilityWitness,
  CausalWorld,
  ModalExecutionBand,
  ModalTransitionKernelSample,
} from '../contracts/mcut.types';
import { MCUT_WORLD_SCHEMA } from '../contracts/mcut.types';
import { fingerprintCausalKernel } from './pccs-ei-certificate.util';
import { snapshotPhiRmsDistance } from './gpm-ei-manifold.util';

const DEFAULT_DIVERGENCE_THRESHOLD = 0.35;

function kernelFingerprintMatch(a: CausalInteractionKernel, b: CausalInteractionKernel): boolean {
  return fingerprintCausalKernel(a) === fingerprintCausalKernel(b);
}

function accessibilityScoreFromDivergence(d: number): number {
  return 1 / (1 + d);
}

export function causalWorldFrom(
  worldId: string,
  phi: CausalFieldSnapshot,
  causalKernel: CausalInteractionKernel,
): CausalWorld {
  return {
    schema: MCUT_WORLD_SCHEMA,
    worldId,
    phi,
    causalKernel,
  };
}

/** Structural distance proxy: Φ RMS + kernel mismatch penalty. */
export function causalWorldStructuralDivergence(
  from: CausalWorld,
  to: CausalWorld,
  kernelMismatchPenalty = 1,
): { phiDivergenceRms: number; kernelAligned: boolean; structuralDivergence: number } {
  const phiDivergenceRms = snapshotPhiRmsDistance(from.phi, to.phi);
  const kernelAligned = kernelFingerprintMatch(from.causalKernel, to.causalKernel);
  const structuralDivergence = kernelAligned
    ? phiDivergenceRms
    : phiDivergenceRms + kernelMismatchPenalty;
  return { phiDivergenceRms, kernelAligned, structuralDivergence };
}

export function evaluateAccessibility(
  from: CausalWorld,
  to: CausalWorld,
  options?: {
    divergenceThreshold?: number;
    kernelMismatchPenalty?: number;
  },
): AccessibilityWitness {
  const threshold = options?.divergenceThreshold ?? DEFAULT_DIVERGENCE_THRESHOLD;
  const pen = options?.kernelMismatchPenalty ?? 1;
  const { phiDivergenceRms, kernelAligned, structuralDivergence } =
    causalWorldStructuralDivergence(from, to, pen);
  const accessibilityScore = accessibilityScoreFromDivergence(structuralDivergence);
  return {
    phiDivergenceRms,
    kernelAligned,
    structuralDivergence,
    accessibilityScore,
    accessibleUnderThreshold: structuralDivergence <= threshold,
  };
}

/** P̂(W₂ | W₁, 𝒪) — uses accessibility score as normalized kernel sample (toy). */
export function modalTransitionKernelStub(
  from: CausalWorld,
  to: CausalWorld,
  operatorTag: string,
  options?: { kernelMismatchPenalty?: number },
): ModalTransitionKernelSample {
  const acc = evaluateAccessibility(from, to, options);
  return {
    probabilityMass: acc.accessibilityScore,
    operatorTag,
  };
}

/** SPCL world alignment — scalar divergence between exec vs shadow worlds (same Kθ typical). */
export function worldAlignmentDivergence(wExec: CausalWorld, wShadow: CausalWorld): number {
  return causalWorldStructuralDivergence(wExec, wShadow, 0).structuralDivergence;
}

/** Replay / equivalence — worlds close in Φ and aligned Kθ. */
export function worldsModallyEquivalent(
  a: CausalWorld,
  b: CausalWorld,
  phiEpsilon: number,
): boolean {
  const { structuralDivergence, kernelAligned } = causalWorldStructuralDivergence(a, b, 1);
  return kernelAligned && structuralDivergence <= phiEpsilon;
}

/** Map accessibility to ECPS-style modal band. */
export function modalExecutionBand(witness: AccessibilityWitness): ModalExecutionBand {
  if (!witness.accessibleUnderThreshold) return 'INACCESSIBLE';
  if (witness.accessibilityScore >= 0.75) return 'NEAR_WORLD';
  return 'FAR_WORLD';
}
