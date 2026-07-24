/**
 * Decision Lab runner contract — no production DB writes.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { OptimizationProblem } from '../../decision-runtime/contracts/optimization-problem';
import type { OptimizationResult } from '../../decision-runtime/contracts/optimization-result';
import type { OptimizationStrategyId } from '../../decision-runtime/optimization/optimization-strategy.interface';

export interface LabRunContext {
  runId: string;
  seed: number;
  fixtureId: string;
  snapshotId: string;
  startedAt: string;
}

export interface LabRunRecord {
  context: LabRunContext;
  strategyId: OptimizationStrategyId;
  problem: OptimizationProblem;
  result: OptimizationResult;
  exportedAt: string;
}

export interface LabRunner {
  readonly runnerId: string;
  run(
    problem: OptimizationProblem,
    context: LabRunContext,
  ): Promise<LabRunRecord>;
}
