/**
 * Oscillation bound — sufficient engineering conditions for bounded oscillation along one arc.
 */

export interface OscillationBoundResult {
  oscillationBounded: boolean;
}

/**
 * User-facing predicate (§Oscillation Theorem): contractive FP step, k < 1, patch magnitude non-increasing.
 */
export function evaluateOscillationBound(input: {
  contractionRate: number;
  k: number;
  patchDecreasing: boolean;
}): OscillationBoundResult {
  const oscillationBounded =
    input.contractionRate > 0 && input.k < 1 && input.patchDecreasing;
  return { oscillationBounded };
}
