/**
 * In-memory benchmark orchestrator — no production DB writes.
 */

import { Injectable, Logger } from '@nestjs/common';
import { isDecisionLabEnabled } from '../decision-lab.config';
import type { LabRunRecord } from '../runners/lab-runner.interface';
import type { OptimizationProblem } from '../../decision-runtime/contracts/optimization-problem';
import { compareOptimizationShadow } from '../../decision-runtime/observability/plan-selection-shadow.util';
import { LegacyFrozenLabRunner } from '../runners/legacy-frozen.runner';
import { CpSatLexicographicLabRunner } from '../runners/cp-sat-lexicographic.runner';
import { CpSatEngineLabRunner } from '../runners/cp-sat-engine-lab.runner';
import {
  ICELAND_MINIMAL_FIXTURE_ID,
  icelandMinimalMultiCandidateFixture,
} from '../fixtures/iceland-minimal.fixture';

export interface LabBenchmarkRequest {
  fixtureIds: string[];
  seed: number;
  strategyIds: string[];
}

export interface LabStrategyComparison {
  fixtureId: string;
  legacyFrozenSelectedId?: string;
  cpSatLexSelectedId?: string;
  cpSatEngineV1SelectedId?: string;
  cpSatEngineV0SelectedId?: string;
  engineAbDiverged?: boolean;
  diverged: boolean;
  utilityWinnerId?: string;
  cpSatSolverEngine?: string;
}

export interface LabBenchmarkSummary {
  runId: string;
  fixtureCount: number;
  strategyCount: number;
  records: LabRunRecord[];
  comparisons: LabStrategyComparison[];
  completedAt: string;
}

@Injectable()
export class LabBenchmarkService {
  private readonly logger = new Logger(LabBenchmarkService.name);
  private readonly legacyRunner = new LegacyFrozenLabRunner();
  private readonly cpSatRunner = new CpSatLexicographicLabRunner();
  private readonly cpSatEngineV1Runner = new CpSatEngineLabRunner('cp-sat-lex-v1');
  private readonly cpSatEngineV0Runner = new CpSatEngineLabRunner('lex-rank-v0');

  isEnabled(): boolean {
    return isDecisionLabEnabled();
  }

  async runBenchmark(request: LabBenchmarkRequest): Promise<LabBenchmarkSummary> {
    if (!this.isEnabled()) {
      this.logger.debug('Decision Lab disabled (DECISION_LAB_ENABLED=0)');
      return emptySummary('lab_disabled');
    }

    const records: LabRunRecord[] = [];
    const comparisons: LabStrategyComparison[] = [];
    const fixtureIds =
      request.fixtureIds.length > 0 ? request.fixtureIds : [ICELAND_MINIMAL_FIXTURE_ID];
    const strategies =
      request.strategyIds.length > 0
        ? request.strategyIds
        : ['legacy-frozen', 'cp-sat-lexicographic'];

    for (const fixtureId of fixtureIds) {
      if (fixtureId !== ICELAND_MINIMAL_FIXTURE_ID) {
        this.logger.warn(`Unknown fixture ${fixtureId} — skipped`);
        continue;
      }

      const tripId = `lab_${fixtureId}_${request.seed}`;
      const useMulti = strategies.length > 1;
      const problem = useMulti
        ? this.cpSatRunner.buildIcelandMultiCandidateProblem(`${tripId}_multi`)
        : this.legacyRunner.buildIcelandMinimalProblem(tripId);

      this.assertReadOnlyProblem(problem);

      const context = {
        runId: `run_${Date.now()}`,
        seed: request.seed,
        fixtureId,
        snapshotId: problem.snapshotId,
        startedAt: new Date().toISOString(),
      };

      let legacyResult: LabRunRecord | undefined;
      let cpSatResult: LabRunRecord | undefined;
      let cpSatV1Result: LabRunRecord | undefined;
      let cpSatV0Result: LabRunRecord | undefined;

      if (strategies.includes('legacy-frozen')) {
        legacyResult = await this.legacyRunner.run(problem, context);
        records.push(legacyResult);
      }
      if (strategies.includes('cp-sat-lexicographic')) {
        cpSatResult = await this.cpSatRunner.run(problem, context);
        records.push(cpSatResult);
      }
      if (strategies.includes('cp-sat-lex-v1')) {
        cpSatV1Result = await this.cpSatEngineV1Runner.run(problem, context);
        records.push(cpSatV1Result);
      }
      if (strategies.includes('cp-sat-lex-v0') || strategies.includes('lex-rank-v0')) {
        cpSatV0Result = await this.cpSatEngineV0Runner.run(problem, context);
        records.push(cpSatV0Result);
      }

      if (legacyResult && cpSatResult) {
        const shadow = compareOptimizationShadow({
          candidates: problem.candidates,
          constraintReports: problem.constraintReportsByCandidateId ?? {},
          legacyFinalizeSelectedId: legacyResult.result.recommendedCandidateId,
          optimizationResult: cpSatResult.result,
        });
        comparisons.push({
          fixtureId,
          legacyFrozenSelectedId: legacyResult.result.recommendedCandidateId,
          cpSatLexSelectedId: cpSatResult.result.recommendedCandidateId,
          cpSatSolverEngine: cpSatResult.result.solverMetadata.solverEngine,
          diverged: shadow.diverged,
          utilityWinnerId: shadow.legacyUtilityWinnerId,
        });
      }

      if (cpSatV1Result && cpSatV0Result) {
        comparisons.push({
          fixtureId,
          cpSatEngineV1SelectedId: cpSatV1Result.result.recommendedCandidateId,
          cpSatEngineV0SelectedId: cpSatV0Result.result.recommendedCandidateId,
          engineAbDiverged:
            cpSatV1Result.result.recommendedCandidateId !==
            cpSatV0Result.result.recommendedCandidateId,
          diverged:
            cpSatV1Result.result.recommendedCandidateId !==
            cpSatV0Result.result.recommendedCandidateId,
          cpSatSolverEngine: 'cp-sat-lex-v1 vs lex-rank-v0',
        });
      }
    }

    return {
      runId: `lab_${Date.now()}`,
      fixtureCount: fixtureIds.length,
      strategyCount: strategies.length,
      records,
      comparisons,
      completedAt: new Date().toISOString(),
    };
  }

  assertReadOnlyProblem(problem: OptimizationProblem): void {
    if (!problem.snapshotId) {
      throw new Error('Lab problem missing snapshotId');
    }
  }
}

function emptySummary(prefix: string): LabBenchmarkSummary {
  return {
    runId: `${prefix}_${Date.now()}`,
    fixtureCount: 0,
    strategyCount: 0,
    records: [],
    comparisons: [],
    completedAt: new Date().toISOString(),
  };
}
