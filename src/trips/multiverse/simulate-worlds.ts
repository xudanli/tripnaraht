import { aggregateCostsFromDag } from '../economy/aggregate-from-dag';
import { scoreDAGWithEconomy } from '../economy/score-dag-economy';
import type { EconomyScoringHints } from '../economy/aggregate-from-dag';
import { executeExecutionIR } from '../execution-ir/execute-execution-ir';
import type { ExecutionWorld, WorldSimulationResult } from './execution-world.types';

function scalarResourceCost(cost: ReturnType<typeof aggregateCostsFromDag>): number {
  return (
    cost.timeCost +
    cost.moneyCost +
    cost.energyCost +
    cost.riskCost +
    cost.opportunityCost
  );
}

export function simulateWorlds(
  worlds: ExecutionWorld[],
  economyHints?: EconomyScoringHints,
): WorldSimulationResult[] {
  return worlds.map(w => {
    const irRun = executeExecutionIR(w.ir, w.dag);
    const resource = aggregateCostsFromDag(w.dag, economyHints);
    const cost = scalarResourceCost(resource);
    const utility = scoreDAGWithEconomy(w.dag, economyHints);

    return {
      worldId: w.worldId,
      irRun,
      cost,
      utility,
      divergenceScore: w.divergenceScore,
    };
  });
}
