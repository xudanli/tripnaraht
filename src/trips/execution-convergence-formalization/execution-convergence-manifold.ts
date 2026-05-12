/**
 * Trajectory-level contraction audit over several execution iterates.
 */

import type { ConvergenceManifold, ExecutionStateSnapshot } from './execution-convergence.types';

export type { ConvergenceManifold } from './execution-convergence.types';

/**
 * From ordered snapshots (S₀…Sₙ), derive residual path and ±1 contraction vector.
 * `isContractiveSystem` is true when each step strictly lowers `residualDelta` (serial decrease).
 */
export function buildConvergenceManifold(states: ExecutionStateSnapshot[]): ConvergenceManifold {
  const residualTrajectory = states.map(s => s.residualDelta);
  const contractionVector: number[] = [];
  for (let i = 1; i < states.length; i++) {
    const prev = states[i - 1]!;
    const cur = states[i]!;
    contractionVector.push(cur.residualDelta < prev.residualDelta ? 1 : -1);
  }

  const isContractiveSystem =
    states.length <= 1 ||
    residualTrajectory.every((r, i) => i === 0 || r < residualTrajectory[i - 1]!);

  return {
    states,
    residualTrajectory,
    contractionVector,
    isContractiveSystem,
  };
}
