/**
 * Detect expanding residual trajectories (practical divergence warning).
 */

export interface DivergenceResult {
  divergent: boolean;
  /** Monotonic non-decreasing residuals over all steps. */
  weaklyExpanding: boolean;
}

/**
 * `divergent` when residuals are strictly increasing end-to-end (length ≥ 2).
 * `weaklyExpanding` when each step is ≥ previous (plateaus allowed).
 */
export function detectResidualDivergence(residuals: number[]): DivergenceResult {
  if (residuals.length < 2) {
    return { divergent: false, weaklyExpanding: false };
  }
  let weaklyExpanding = true;
  for (let i = 1; i < residuals.length; i++) {
    if (residuals[i]! < residuals[i - 1]! - 1e-12) {
      weaklyExpanding = false;
      break;
    }
  }
  const first = residuals[0]!;
  const last = residuals[residuals.length - 1]!;
  const divergent = last > first + 1e-9 && residuals.every((r, i) => i === 0 || r > residuals[i - 1]! + 1e-12);
  return { divergent, weaklyExpanding };
}
