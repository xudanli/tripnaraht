/**
 * Contraction proof bundle — engineering proxy for “F is contractive on observed arc”.
 */

import type { ContractionProof } from './contraction-proof.types';
import type { FormalIterationSnapshot } from './formal-snapshot';
import { estimateLipschitzConstant, estimateStateDistance } from './estimate-contraction';

export type { ContractionProof } from './contraction-proof.types';

const OSCILLATION_K = 0.92;

export function evaluateContraction(
  prev: FormalIterationSnapshot | null,
  next: FormalIterationSnapshot,
): ContractionProof {
  if (!prev) {
    return {
      contractive: true,
      lipschitzConstant: 0,
      proofConfidence: 0.55,
      boundedOscillation: true,
      monotonicPatchSequence: true,
      suggestRollback: false,
    };
  }

  const k = estimateLipschitzConstant(prev, next);
  const contractive = k < 1;
  const boundedOscillation = k < OSCILLATION_K;
  const monotonicPatchSequence = next.patchMagnitude <= prev.patchMagnitude + 1e-9;
  const proofConfidence = k < 0.8 ? 0.88 : k < 1 ? 0.62 : 0.35;

  const suggestRollback = !contractive || (!monotonicPatchSequence && k >= 1);

  return {
    contractive,
    lipschitzConstant: k,
    proofConfidence,
    boundedOscillation,
    monotonicPatchSequence,
    suggestRollback,
  };
}

/** Optional: distance-only diagnostic between two materialized states. */
export function contractionStepDistance(
  prev: FormalIterationSnapshot,
  next: FormalIterationSnapshot,
): number {
  return estimateStateDistance(prev, next);
}
