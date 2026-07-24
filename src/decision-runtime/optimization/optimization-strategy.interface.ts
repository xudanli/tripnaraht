/**
 * Pluggable optimization strategy contract.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type {
  OptimizationProblem,
  OptimizationProblemProfile,
  SolverBudget,
} from '../contracts/optimization-problem';
import type { OptimizationResult } from '../contracts/optimization-result';

export type OptimizationStrategyId =
  | 'legacy-frozen'
  | 'weighted-score'
  | 'cp-sat-lexicographic'
  | 'cp-sat-epsilon'
  | 'bounded-lns-repair'
  | 'rule-fallback';

export interface OptimizationStrategy {
  readonly strategyId: OptimizationStrategyId;
  readonly strategyVersion: string;

  supports(profile: OptimizationProblemProfile): boolean;

  solve(problem: OptimizationProblem, budget: SolverBudget): Promise<OptimizationResult>;
}
