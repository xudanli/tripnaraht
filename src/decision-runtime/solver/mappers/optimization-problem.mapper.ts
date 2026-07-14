/**
 * Build SolverProblem from RepairProviderContext or passthrough wire body.
 * Full Effective-Plan → Solver projection lands in S2; S1 accepts prebuilt SolverProblem.
 */

import { Injectable } from '@nestjs/common';
import type { SolverProblem } from '../contracts/solver-problem';
import { SOLVER_MVP_OPERATIONS } from '../contracts/solver-problem';
import { isOrToolsMoveDayShadowEnabled } from '../ortools-solver.config';

export const OR_TOOLS_PROVIDER_CONTEXT_KEY = 'ortools';

@Injectable()
export class OptimizationProblemMapper {
  /**
   * Read `providerContext.ortools.solverProblem` (or the object itself if schemaId matches).
   */
  fromProviderContext(
    providerContext: Record<string, unknown> | undefined,
  ): SolverProblem | null {
    const raw = providerContext?.[OR_TOOLS_PROVIDER_CONTEXT_KEY];
    if (!raw || typeof raw !== 'object') return null;

    const box = raw as Record<string, unknown>;
    const candidate =
      box.solverProblem && typeof box.solverProblem === 'object'
        ? (box.solverProblem as Record<string, unknown>)
        : box;

    if (candidate.schemaId !== 'tripnara.solver_problem@v1') return null;
    const problem = candidate as unknown as SolverProblem;

    const moveDayOk =
      problem.operation === 'MOVE_DAY' &&
      isOrToolsMoveDayShadowEnabled() &&
      (problem.scope?.dayIds?.length ?? 0) >= 2;
    if (
      !SOLVER_MVP_OPERATIONS.includes(problem.operation) &&
      !moveDayOk
    ) {
      return null;
    }
    if (!problem.requestId || !problem.tripId || !Array.isArray(problem.nodes)) {
      return null;
    }
    return problem;
  }
}
