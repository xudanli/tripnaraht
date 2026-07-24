/**
 * Lab runner — LegacyFrozenStrategy without production DB writes.
 */

import { DecisionCoreService } from '../../trips/guardian-decision-core/services/decision-core.service';
import { LegacyFrozenStrategy } from '../../decision-runtime/optimization/strategies/legacy-frozen.strategy';
import { CanonicalSolutionPostValidatorService } from '../../decision-runtime/optimization/post-validator.service';
import { ObjectiveSemanticsRegistry } from '../../decision-runtime/objectives/objective-semantics.registry';
import { tripWorldStateToCanonicalSnapshot } from '../../decision-runtime/snapshot/trip-world-to-canonical.util';
import { assembleOptimizationProblem } from '../../decision-runtime/core/optimization-problem-assembler.util';
import type { LabRunContext, LabRunRecord, LabRunner } from './lab-runner.interface';
import type { OptimizationProblem } from '../../decision-runtime/contracts/optimization-problem';
import {
  ICELAND_MINIMAL_FIXTURE_ID,
  icelandMinimalCandidate,
  icelandMinimalConstraintReport,
  icelandMinimalWorldState,
} from '../fixtures/iceland-minimal.fixture';

export class LegacyFrozenLabRunner implements LabRunner {
  readonly runnerId = 'legacy-frozen-lab';

  private readonly strategy: LegacyFrozenStrategy;

  constructor() {
    const decisionCore = new DecisionCoreService();
    const objectives = new ObjectiveSemanticsRegistry();
    this.strategy = new LegacyFrozenStrategy(
      decisionCore,
      new CanonicalSolutionPostValidatorService(),
      objectives,
    );
  }

  async run(
    problem: OptimizationProblem,
    context: LabRunContext,
  ): Promise<LabRunRecord> {
    const result = await this.strategy.solve(problem, {
      timeLimitMs: 30_000,
      proveOptimality: false,
    });
    return {
      context,
      strategyId: 'legacy-frozen',
      problem,
      result,
      exportedAt: new Date().toISOString(),
    };
  }

  /** Build problem from built-in Iceland minimal fixture */
  buildIcelandMinimalProblem(tripId = 'lab_trip_iceland'): OptimizationProblem {
    const worldState = icelandMinimalWorldState();
    const candidate = icelandMinimalCandidate();
    const snapshot = tripWorldStateToCanonicalSnapshot({
      tripId,
      snapshotId: `lab_ws_${tripId}`,
      revision: '1',
      worldState,
      plan: candidate.plan,
    });
    return assembleOptimizationProblem({
      tripId,
      snapshot,
      candidates: [candidate],
      constraintReportsByCandidateId: {
        balanced: icelandMinimalConstraintReport(tripId),
      },
      worldState,
      problemId: `lab_${ICELAND_MINIMAL_FIXTURE_ID}`,
    });
  }
}
