/**
 * CP-SAT-compatible Lexicographic Candidate Selector (Lab / Shadow).
 *
 * Selects among pre-built full-plan candidates via enumerative lexicographic elimination.
 * NOT POI-level native CP-SAT. See solver-capability.constants.ts.
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
import { ObjectiveSemanticsRegistry } from '../../objectives/objective-semantics.registry';
import { isLegacyFeasibleFromReport } from '../../constraints/contracts/canonical-constraint-report';
import { resolveCpSatSolverEngine } from '../engines/cp-sat-engine.resolver';
import {
  buildCandidateEvaluations,
  solveLexicographicCpSat,
} from '../engines/cp-sat-lexicographic.engine';
import type { LexicographicStageTrace } from '../engines/cp-sat-engine.types';
import { rankCandidatesLexicographic } from '../lexicographic-rank.util';
import {
  CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY,
  LEX_RANK_V0_CAPABILITY,
} from '../solver-capability.constants';

const STRATEGY_VERSION = '1.0.0-cp-sat-lex-v1';
const MAX_POI_LAB = 80;

@Injectable()
export class CpSatLexicographicStrategy implements OptimizationStrategy {
  readonly strategyId = 'cp-sat-lexicographic' as const;
  readonly strategyVersion = STRATEGY_VERSION;

  private readonly logger = new Logger(CpSatLexicographicStrategy.name);

  constructor(private readonly objectiveRegistry: ObjectiveSemanticsRegistry) {}

  supports(profile: OptimizationProblemProfile): boolean {
    return profile.phase === 'PLANNING' && profile.poiCount <= MAX_POI_LAB;
  }

  async solve(
    problem: OptimizationProblem,
    budget: SolverBudget,
  ): Promise<OptimizationResult> {
    const started = Date.now();
    const traceId = newOptimizationTraceId();
    const engineId = resolveCpSatSolverEngine();

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
        solverEngine: engineId,
      });
    }

    const feasibleCandidates = problem.candidates.filter((c) => {
      const report =
        problem.constraintReportsByCandidateId?.[c.candidateId] ??
        problem.constraintReport;
      return isLegacyFeasibleFromReport(report);
    });

    if (feasibleCandidates.length === 0) {
      return this.buildResult(problem, {
        feasibilityStatus: 'UNVERIFIED',
        terminationReason: 'INFEASIBLE_PROVEN',
        hasIncumbent: false,
        recommendedCandidateId: undefined,
        traceId,
        elapsedMs: Date.now() - started,
        summary: 'No feasible candidates after gateway filter',
        solverEngine: engineId,
      });
    }

    const enabledObjectives = problem.objectiveProfile.enabledObjectives;
    const candidateEvaluations = buildCandidateEvaluations({
      candidates: feasibleCandidates,
      enabledObjectives,
      registry: this.objectiveRegistry,
    });

    const cpSatResult = solveLexicographicCpSat(
      {
        candidates: feasibleCandidates,
        enabledObjectives,
        timeLimitMs: budget.timeLimitMs,
        candidateEvaluations,
      },
      engineId,
    );

    const winnerId = cpSatResult.winnerId;
    const winner = feasibleCandidates.find((c) => c.candidateId === winnerId);

    const rankTrace =
      engineId === 'lex-rank-v0'
        ? rankCandidatesLexicographic({
            candidates: feasibleCandidates,
            enabledObjectives,
            registry: this.objectiveRegistry,
          })
            .slice(0, 5)
            .map((r) => ({ candidateId: r.candidateId, vector: r.vector }))
        : cpSatResult.rankedCandidateIds.slice(0, 5).map((candidateId) => ({
            candidateId,
            vector: [],
          }));

    const objectiveEvaluations = winner
      ? this.objectiveRegistry.evaluatePlan({
          plan: winner.plan,
          utilityHint: winner.utilityHint,
          enabledObjectives,
        })
      : [];

    const summary = winner
      ? `${CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY.displayName}: ${winnerId} (${cpSatResult.engineId}, ${cpSatResult.stageTraces.length} stages${cpSatResult.tieBreakUsed ? ', tie-break' : ''})`
      : 'No lexicographic candidate incumbent';

    this.logger.debug(
      `[CpSatLex] problem=${problem.problemId} engine=${cpSatResult.engineId} winner=${winnerId} stages=${cpSatResult.stageTraces.length}`,
    );

    return this.buildResult(problem, {
      feasibilityStatus: winner ? 'FEASIBLE' : 'UNVERIFIED',
      terminationReason: cpSatResult.timedOut ? 'TIME_LIMIT' : 'OPTIMAL',
      hasIncumbent: cpSatResult.incumbentFound,
      recommendedCandidateId: winnerId,
      traceId,
      elapsedMs: cpSatResult.elapsedMs,
      summary,
      objectiveEvaluations,
      rankTrace,
      stageTraces: cpSatResult.stageTraces,
      solverEngine: cpSatResult.engineId,
      tieBreakUsed: cpSatResult.tieBreakUsed,
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
      objectiveEvaluations?: OptimizationResult['objectiveEvaluations'];
      rankTrace?: Array<{ candidateId: string; vector: number[] }>;
      stageTraces?: LexicographicStageTrace[];
      solverEngine: string;
      tieBreakUsed?: boolean;
    },
  ): OptimizationResult {
    const traceKind =
      input.solverEngine === 'cp-sat-lex-v1'
        ? 'CP_SAT_LEX_V1'
        : 'CP_SAT_LEX_LAB_V0';

    const capability =
      input.solverEngine === 'lex-rank-v0'
        ? LEX_RANK_V0_CAPABILITY
        : CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY;

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
      objectiveEvaluations: input.objectiveEvaluations,
      constraintReport: problem.constraintReport,
      optimizationTrace: {
        traceId: input.traceId,
        steps: [
          {
            stepId: 'cp_sat_lex',
            kind: traceKind,
            at: new Date().toISOString(),
            detail: {
              solverEngine: input.solverEngine,
              solverFamily: capability.solverFamily,
              optimizationLevel: capability.optimizationLevel,
              nativeCpSat: capability.nativeCpSat,
              tieBreakUsed: input.tieBreakUsed ?? false,
              rankTrace: input.rankTrace,
              stageTraces: input.stageTraces,
            },
          },
        ],
      },
      solverMetadata: {
        strategyId: this.strategyId,
        strategyVersion: this.strategyVersion,
        solverEngine: input.solverEngine,
        displayName: capability.displayName,
        solverFamily: capability.solverFamily,
        optimizationLevel: capability.optimizationLevel,
        nativeCpSat: capability.nativeCpSat,
        elapsedMs: input.elapsedMs,
      },
      explanation: {
        schemaId: 'tripnara.structured_explanation@v1',
        summary: input.summary,
      },
    };
  }
}
