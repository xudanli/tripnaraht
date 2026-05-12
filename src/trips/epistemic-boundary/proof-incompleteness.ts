/**
 * P-ECO-Closure-9 — Partition of proof status: provable vs empirical vs unprovable vs contradictory evidence.
 */

import type { ContractionProof } from '../execution-formal-proof/contraction-proof.types';

export interface ProofBoundary {
  provable: number;
  empiricallySupported: number;
  unprovable: number;
  contradictory: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function normalizePartition(a: number, b: number, c: number, d: number): ProofBoundary {
  const s = a + b + c + d;
  if (s < 1e-9) {
    return { provable: 0.25, empiricallySupported: 0.25, unprovable: 0.25, contradictory: 0.25 };
  }
  return {
    provable: a / s,
    empiricallySupported: b / s,
    unprovable: c / s,
    contradictory: d / s,
  };
}

export function evaluateProofBoundary(input: {
  contractionProof?: ContractionProof;
  probabilisticTailMass: number;
  recursiveSelfReferenceRisk: number;
  causalLikelihood: number;
}): ProofBoundary {
  const provable = clamp01((input.contractionProof?.proofConfidence ?? 0.4) * 0.55);
  const empirical = clamp01(
    0.5 * input.probabilisticTailMass + 0.5 * (input.contractionProof?.contractive ? 0.35 : 0.15),
  );
  const unprovable = clamp01(
    0.45 * (1 - (input.contractionProof?.proofConfidence ?? 0)) +
      0.35 * input.recursiveSelfReferenceRisk +
      0.2 * (1 - input.causalLikelihood),
  );
  const contradictory = clamp01(
    (input.contractionProof?.contractive === false && (input.contractionProof?.lipschitzConstant ?? 1) >= 1
      ? 0.15
      : 0) + 0.05 * input.recursiveSelfReferenceRisk,
  );

  return normalizePartition(provable, empirical, unprovable, contradictory);
}
