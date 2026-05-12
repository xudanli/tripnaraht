import type { ExecutionCandidate } from './agent.types';

/** Scalar used for total ordering — replaceable with Borda / Pareto later. */
export function consensusScalarScore(candidate: ExecutionCandidate): number {
  const { utility, risk, cost, stability } = candidate.score;
  return utility * 1.15 - risk * 1.05 - cost * 0.85 + stability * 1.0;
}

export function buildConsensus(candidates: ExecutionCandidate[]): ExecutionCandidate {
  if (!candidates.length) {
    throw new Error('[P15-A] buildConsensus requires at least one candidate');
  }
  return [...candidates].sort((a, b) => consensusScalarScore(b) - consensusScalarScore(a))[0]!;
}
