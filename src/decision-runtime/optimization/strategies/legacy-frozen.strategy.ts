/**
 * LegacyFrozenStrategy — wraps DecisionCore.finalize (production default until lab sign-off).
 * Does NOT re-run Legacy candidate generation; consumes pre-built OptimizationProblem.
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionCoreService } from '../../../trips/guardian-decision-core/services/decision-core.service';
import type { OptimizationStrategy } from '../optimization-strategy.interface';
import type {
  OptimizationProblem,
  OptimizationProblemProfile,
  SolverBudget,
} from '../../contracts/optimization-problem';
import type { OptimizationResult } from '../../contracts/optimization-result';
import type { PlanningContext } from '../../candidates/contracts/decision-candidate';
import { buildFullPlanDecisionWorkspace } from '../../core/build-full-plan-workspace.util';
import { runMandatoryFeasibilityGate } from '../../core/mandatory-feasibility-gate.util';
import { newOptimizationTraceId } from '../../core/optimization-problem-assembler.util';
import { CanonicalSolutionPostValidatorService } from '../post-validator.service';
import { ObjectiveSemanticsRegistry } from '../../objectives/objective-semantics.registry';
import { LEGACY_FROZEN_SELECTOR_CAPABILITY } from '../solver-capability.constants';

const STRATEGY_VERSION = '0.1.0';

@Injectable()
export class LegacyFrozenStrategy implements OptimizationStrategy {
  readonly strategyId = 'legacy-frozen' as const;
  readonly strategyVersion = STRATEGY_VERSION;

  private readonly logger = new Logger(LegacyFrozenStrategy.name);

  constructor(
    private readonly decisionCore: DecisionCoreService,
    private readonly postValidator: CanonicalSolutionPostValidatorService,
    private readonly objectiveRegistry: ObjectiveSemanticsRegistry,
  ) {}

  supports(_profile: OptimizationProblemProfile): boolean {
    return true;
  }

  async solve(
    problem: OptimizationProblem,
    budget: SolverBudget,
  ): Promise<OptimizationResult> {
    const started = Date.now();
    const traceId = newOptimizationTraceId();

    const gate = runMandatoryFeasibilityGate(problem);
    if (!gate.passed) {
      return this.buildResult(problem, {
        feasibilityStatus: 'INFEASIBLE',
        terminationReason: 'INFEASIBLE_PROVEN',
        hasIncumbent: false,
        candidates: problem.candidates,
        recommendedCandidateId: undefined,
        constraintReport: problem.constraintReport,
        traceId,
        elapsedMs: Date.now() - started,
        summary: `L1 gate blocked: ${gate.reasonCodes.join(', ')}`,
      });
    }

    const reportsByCandidate = this.resolveReportsByCandidate(problem);
    const planningContext: PlanningContext = {
      tripId: problem.tripId,
      worldStateSnapshotId: problem.snapshotId,
      basePlanVersionId: `plan_${problem.tripId}_draft`,
      materializeFromTripPlan: problem.materializeFromTripPlan === true,
    };

    const { workspace, baseCandidateId } = buildFullPlanDecisionWorkspace({
      problemId: problem.problemId,
      context: planningContext,
      candidates: problem.candidates,
      constraintReportsByCandidateId: reportsByCandidate,
    });

    const { record, humanDecisionRequired } = this.decisionCore.finalize({
      workspace,
      currentWorldStateSnapshotId: problem.snapshotId,
      baseCandidateId,
      defaultAuthorizationLevel: 'L2',
    });

    const selected = problem.candidates.find(
      (c) => c.candidateId === record.selectedCandidateId,
    ) ?? problem.candidates.find((c) => c.candidateId === 'original');

    const objectiveEvaluations = selected
      ? this.objectiveRegistry.evaluatePlan({
          plan: selected.plan,
          utilityHint: selected.utilityHint,
          enabledObjectives: problem.objectiveProfile.enabledObjectives,
        })
      : [];

    const elapsedMs = Date.now() - started;
    const timedOut = elapsedMs >= budget.timeLimitMs;

    let result = this.buildResult(problem, {
      feasibilityStatus: record.selectedCandidateId ? 'FEASIBLE' : 'UNVERIFIED',
      terminationReason: timedOut ? 'TIME_LIMIT' : 'FEASIBLE_NOT_PROVEN_OPTIMAL',
      hasIncumbent: !!record.selectedCandidateId,
      candidates: problem.candidates,
      recommendedCandidateId: record.selectedCandidateId,
      constraintReport: problem.constraintReport,
      traceId,
      elapsedMs,
      summary: humanDecisionRequired
        ? 'Recommendation requires L2 authorization'
        : `Selected ${record.selectedCandidateId}`,
      objectiveEvaluations,
      objectiveValue: selected?.utilityHint,
      humanDecisionRequired,
      decisionRecord: record,
    });

    result = await this.postValidator.validateResult(result);
    this.logger.debug(
      `[LegacyFrozen] problem=${problem.problemId} selected=${record.selectedCandidateId} ms=${elapsedMs}`,
    );
    return result;
  }

  private resolveReportsByCandidate(
    problem: OptimizationProblem,
  ): Record<string, import('../../constraints/contracts/canonical-constraint-report').CanonicalConstraintReport> {
    if (problem.constraintReportsByCandidateId) {
      return problem.constraintReportsByCandidateId;
    }
    const out: Record<string, import('../../constraints/contracts/canonical-constraint-report').CanonicalConstraintReport> =
      {};
    for (const c of problem.candidates) {
      out[c.candidateId] = problem.constraintReport;
    }
    return out;
  }

  private buildResult(
    problem: OptimizationProblem,
    input: {
      feasibilityStatus: OptimizationResult['feasibilityStatus'];
      terminationReason: OptimizationResult['terminationReason'];
      hasIncumbent: boolean;
      candidates: OptimizationResult['candidates'];
      recommendedCandidateId?: string;
      constraintReport: OptimizationResult['constraintReport'];
      traceId: string;
      elapsedMs: number;
      summary: string;
      objectiveEvaluations?: OptimizationResult['objectiveEvaluations'];
      objectiveValue?: number;
      humanDecisionRequired?: boolean;
      decisionRecord?: OptimizationResult['decisionRecord'];
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
      objectiveValue: input.objectiveValue,
      objectiveEvaluations: input.objectiveEvaluations,
      constraintReport: input.constraintReport,
      optimizationTrace: {
        traceId: input.traceId,
        steps: [
          {
            stepId: 'legacy_finalize',
            kind: 'DECISION_CORE_FINALIZE',
            at: new Date().toISOString(),
            detail: { recommendedCandidateId: input.recommendedCandidateId },
          },
        ],
      },
      solverMetadata: {
        strategyId: this.strategyId,
        strategyVersion: this.strategyVersion,
        solverEngine: 'decision-core-finalize',
        displayName: LEGACY_FROZEN_SELECTOR_CAPABILITY.displayName,
        solverFamily: LEGACY_FROZEN_SELECTOR_CAPABILITY.solverFamily,
        optimizationLevel: LEGACY_FROZEN_SELECTOR_CAPABILITY.optimizationLevel,
        nativeCpSat: LEGACY_FROZEN_SELECTOR_CAPABILITY.nativeCpSat,
        elapsedMs: input.elapsedMs,
      },
      explanation: {
        schemaId: 'tripnara.structured_explanation@v1',
        summary: input.summary,
      },
      humanDecisionRequired: input.humanDecisionRequired,
      decisionRecord: input.decisionRecord,
    };
  }
}
