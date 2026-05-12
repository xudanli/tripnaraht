import type { WorldSimulationResult } from './execution-world.types';

/** Scalar objective — higher is better (matches P17 spec weights). */
export function stableWorldObjective(r: WorldSimulationResult): number {
  return r.utility - r.cost * 0.3 - r.divergenceScore * 0.5;
}

export function selectStableWorld(results: WorldSimulationResult[]): WorldSimulationResult {
  if (!results.length) {
    throw new Error('[P17] selectStableWorld requires at least one simulation result');
  }
  return [...results].sort((a, b) => stableWorldObjective(b) - stableWorldObjective(a))[0]!;
}

export function explainStableWorldSelection(
  winner: WorldSimulationResult,
  all: WorldSimulationResult[],
): string[] {
  const lines: string[] = [];
  const bestScore = stableWorldObjective(winner);
  lines.push(
    `Selected ${winner.worldId}: stableScore=${bestScore.toFixed(4)} utility=${winner.utility.toFixed(4)} cost=${winner.cost.toFixed(4)} divergence=${winner.divergenceScore.toFixed(4)}`,
  );

  for (const r of all) {
    if (r.worldId === winner.worldId) {
      continue;
    }
    const gap = bestScore - stableWorldObjective(r);
    lines.push(
      `Rejected ${r.worldId}: stableScore=${stableWorldObjective(r).toFixed(4)} (Δ=${gap.toFixed(4)} vs winner)`,
    );
  }

  return lines;
}
