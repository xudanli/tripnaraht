/**
 * M6 — Bounded LNS repair strategy (local disruption scope only).
 * Selects among pre-built repair candidates — does not regenerate full trip.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { OptimizationStrategy } from '../optimization-strategy.interface';
import type {
  OptimizationProblem,
  OptimizationProblemProfile,
  SolverBudget,
} from '../../contracts/optimization-problem';
import type { OptimizationResult } from '../../contracts/optimization-result';
import { runMandatoryFeasibilityGate } from '../../core/mandatory-feasibility-gate.util';
import { newOptimizationTraceId } from '../../core/optimization-problem-assembler.util';
import { isLegacyFeasibleFromReport } from '../../constraints/contracts/canonical-constraint-report';
import { isBoundedLnsRepairEnabled } from '../../local-repair/bounded-lns-repair.config';
import {
  boundedRepairSummary,
  selectBoundedRepairCandidate,
} from '../../local-repair/bounded-lns-repair.util';
import type { ReplanningScope } from '../../trigger/replanning-trigger-decision.util';

const STRATEGY_VERSION = '0.1.0-bounded-lns';

@Injectable()
export class BoundedLnsRepairStrategy implements OptimizationStrategy {
  readonly strategyId = 'bounded-lns-repair' as const;
  readonly strategyVersion = STRATEGY_VERSION;

  private readonly logger = new Logger(BoundedLnsRepairStrategy.name);

  supports(profile: OptimizationProblemProfile): boolean {
    return (
      isBoundedLnsRepairEnabled() &&
      profile.disruptionScope === 'LOCAL'
    );
  }

  async solve(
    problem: OptimizationProblem,
    budget: SolverBudget,
  ): Promise<OptimizationResult> {
    const started = Date.now();
    const traceId = newOptimizationTraceId();
    const scope: ReplanningScope = 'DAY';

    const gate = runMandatoryFeasibilityGate(problem);
    if (!gate.passed) {
      return this.buildResult(problem, {
        feasibilityStatus: 'INFEASIBLE',
        terminationReason: 'INFEASIBLE_PROVEN',
        hasIncumbent: false,
        recommendedCandidateId: undefined,
        traceId,
        elapsedMs: Date.now() - started,
        summary: `L1 gate blocked: ${gate.reasonCodes.join(', ')}`,
      });
    }

    const feasible = problem.candidates.filter((c) => {
      const report =
        problem.constraintReportsByCandidateId?.[c.candidateId] ??
        problem.constraintReport;
      return isLegacyFeasibleFromReport(report);
    });

    const selected = selectBoundedRepairCandidate(feasible, scope);
    if (!selected) {
      return this.buildResult(problem, {
        feasibilityStatus: 'INFEASIBLE',
        terminationReason: 'INFEASIBLE_PROVEN',
        hasIncumbent: false,
        recommendedCandidateId: undefined,
        traceId,
        elapsedMs: Date.now() - started,
        summary: 'No feasible repair candidate in bounded scope',
      });
    }

    this.logger.debug(
      `[BoundedLNS] ${boundedRepairSummary(scope, selected.candidateId)} budget=${budget.timeLimitMs}ms`,
    );

    return this.buildResult(problem, {
      feasibilityStatus: 'FEASIBLE',
      terminationReason: 'FEASIBLE_NOT_PROVEN_OPTIMAL',
      hasIncumbent: true,
      recommendedCandidateId: selected.candidateId,
      traceId,
      elapsedMs: Date.now() - started,
      summary: boundedRepairSummary(scope, selected.candidateId),
    });
  }

  private buildResult(
    problem: OptimizationProblem,
    input: {
      feasibilityStatus: OptimizationResult['feasibilityStatus'];
      terminationReason: OptimizationResult['terminationReason'];
      hasIncumbent: boolean;
      recommendedCandidateId?: string;
      traceId: string;
      elapsedMs: number;
      summary: string;
    },
  ): OptimizationResult {
    return {
      schemaId: 'tripnara.optimization_result@v1',
      problemId: problem.problemId,
      tripId: problem.tripId,
      snapshotId: problem.snapshotId,
      feasibilityStatus: input.feasibilityStatus,
      terminationReason: input.terminationReason,
      hasIncumbent: input.hasIncumbent,
      candidates: problem.candidates,
      recommendedCandidateId: input.recommendedCandidateId,
      constraintReport: problem.constraintReport,
      optimizationTrace: {
        traceId: input.traceId,
        steps: [
          {
            stepId: 'bounded_lns_select',
            kind: 'BOUNDED_LNS_REPAIR',
            at: new Date().toISOString(),
            detail: { recommendedCandidateId: input.recommendedCandidateId },
          },
        ],
      },
      solverMetadata: {
        strategyId: this.strategyId,
        strategyVersion: this.strategyVersion,
        solverFamily: 'LEXICOGRAPHIC_RANK_FALLBACK',
        optimizationLevel: 'FULL_PLAN_CANDIDATE_SELECTION',
        nativeCpSat: false,
        displayName: 'Bounded LNS Local Repair Selector',
        elapsedMs: input.elapsedMs,
      },
      explanation: {
        schemaId: 'tripnara.structured_explanation@v1',
        summary: input.summary,
      },
    };
  }
}
