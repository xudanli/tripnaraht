import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { aggregateCostsFromDag, estimateValueFromDag, type EconomyScoringHints } from './aggregate-from-dag';
import { computeExecutionUtility } from './compute-execution-utility';

export function scoreDAGWithEconomy(dag: ExecutionTruthDAG, hints?: EconomyScoringHints): number {
  const cost = aggregateCostsFromDag(dag, hints);
  const value = estimateValueFromDag(dag, hints);
  return computeExecutionUtility(value, cost);
}
