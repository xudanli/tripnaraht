/**
 * Lab runner — CP-SAT Lexicographic (v0 ranking) without production DB writes.
 */

import { CpSatLexicographicStrategy } from '../../decision-runtime/optimization/strategies/cp-sat-lexicographic.strategy';
import { ObjectiveSemanticsRegistry } from '../../decision-runtime/objectives/objective-semantics.registry';
import { tripWorldStateToCanonicalSnapshot } from '../../decision-runtime/snapshot/trip-world-to-canonical.util';
import { assembleOptimizationProblem } from '../../decision-runtime/core/optimization-problem-assembler.util';
import type { LabRunContext, LabRunRecord, LabRunner } from './lab-runner.interface';
import type { OptimizationProblem } from '../../decision-runtime/contracts/optimization-problem';
import {
  ICELAND_MINIMAL_FIXTURE_ID,
  icelandMinimalCandidate,
  icelandMinimalConstraintReport,
  icelandMinimalMultiCandidateFixture,
  icelandMinimalWorldState,
} from '../fixtures/iceland-minimal.fixture';

export class CpSatLexicographicLabRunner implements LabRunner {
  readonly runnerId = 'cp-sat-lex-lab';

  private readonly strategy: CpSatLexicographicStrategy;

  constructor() {
    this.strategy = new CpSatLexicographicStrategy(new ObjectiveSemanticsRegistry());
  }

  async run(
    problem: OptimizationProblem,
    context: LabRunContext,
  ): Promise<LabRunRecord> {
    const result = await this.strategy.solve(problem, {
      timeLimitMs: 30_000,
      proveOptimality: true,
    });
    return {
      context,
      strategyId: 'cp-sat-lexicographic',
      problem,
      result,
      exportedAt: new Date().toISOString(),
    };
  }

  buildIcelandMinimalProblem(tripId = 'lab_trip_iceland'): OptimizationProblem {
    return this.buildFromFixture(tripId, [icelandMinimalCandidate()]);
  }

  buildIcelandMultiCandidateProblem(tripId = 'lab_trip_iceland_multi'): OptimizationProblem {
    return this.buildFromFixture(tripId, icelandMinimalMultiCandidateFixture());
  }

  private buildFromFixture(
    tripId: string,
    candidates: ReturnType<typeof icelandMinimalMultiCandidateFixture>,
  ): OptimizationProblem {
    const worldState = icelandMinimalWorldState();
    const snapshot = tripWorldStateToCanonicalSnapshot({
      tripId,
      snapshotId: `lab_ws_${tripId}`,
      revision: '1',
      worldState,
      plan: candidates[0]?.plan,
    });
    const reports: Record<string, ReturnType<typeof icelandMinimalConstraintReport>> = {};
    for (const c of candidates) {
      reports[c.candidateId] = icelandMinimalConstraintReport(tripId);
    }
    return assembleOptimizationProblem({
      tripId,
      snapshot,
      candidates,
      constraintReportsByCandidateId: reports,
      worldState,
      problemId: `lab_${ICELAND_MINIMAL_FIXTURE_ID}_${tripId}`,
    });
  }
}
