import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { LoopRunDetail } from '../types/loop-run.types';
import type {
  DecisionLearningSixTuple,
  LoopEvalCase,
  LoopEvalCaseKind,
  LoopEvalReplayExpectations,
} from '../types/loop-eval-case.types';
import type { LoopType } from '../types/loop-definition.types';

@Injectable()
export class LoopEvalCaseMaterializerService {
  materialize(run: LoopRunDetail): LoopEvalCase | null {
    const outcome = (run.finalOutcome ?? {}) as Record<string, unknown>;
    const before = (outcome.before ?? {}) as Record<string, unknown>;
    const after = (outcome.after ?? {}) as Record<string, unknown>;
    const stopReason = typeof outcome.stopReason === 'string' ? outcome.stopReason : undefined;
    const requiresApproval = Boolean(outcome.requiresApproval);

    const kind = this.classifyKind(run.status, stopReason, before, after, run.iterations.length);
    if (!kind) return null;

    const options = run.iterations.map((it) => ({
      id: String(it.proposedAction.optionId ?? it.proposedAction.planId ?? `seq-${it.sequence}`),
      title: String(it.proposedAction.title ?? it.diagnosis.issueTitle ?? it.diagnosis.triggerTitle ?? ''),
      actionType: String(it.proposedAction.actionType ?? 'unknown'),
      sequence: it.sequence,
      validationPassed: Boolean((it.validationResult as Record<string, unknown>)?.passed),
    }));

    const chosen = options.find((o) => o.validationPassed) ?? options[0];
    const rejected = options.find((o) => o.id !== chosen?.id);

    const sixTuple: DecisionLearningSixTuple = {
      context: {
        tripId: run.tripId,
        loopType: run.loopType as LoopType,
        loopRunId: run.id,
        triggerEventId: run.triggerEventId,
        triggerType: typeof run.metadata?.triggerType === 'string' ? run.metadata.triggerType : undefined,
        before,
      },
      options,
      decision: {
        loopStatus: run.status,
        chosenOptionId: chosen?.id,
        requiresApproval,
      },
      reason: {
        stopReason,
        diagnoses: run.iterations.map((it) => it.diagnosis),
      },
      outcome: {
        after,
        iterationCount: run.iterations.length,
      },
      counterfactual: rejected
        ? {
            rejectedOptionId: rejected.id,
            rejectedTitle: rejected.title,
            note: 'If the alternate candidate had been chosen, validation outcome may differ.',
          }
        : undefined,
    };

    return {
      id: `loop-eval-${run.loopType.toLowerCase()}-${run.id.slice(-8)}-${kind.toLowerCase()}`,
      kind,
      loopType: run.loopType as LoopType,
      loopRunId: run.id,
      tripId: run.tripId,
      capturedAt: new Date().toISOString(),
      sixTuple,
      replayExpectations: this.buildReplayExpectations(kind, run.loopType as LoopType, before, after),
      approval: { status: 'PENDING' },
      metadata: {
        source: 'loop_engineering_v1',
        tags: [run.loopType, kind, stopReason ?? 'unknown'].filter(Boolean),
        priority: kind === 'FAILURE' ? 'P0' : kind === 'REGRESSION' ? 'P1' : 'P2',
      },
    };
  }

  materializeBatch(runs: LoopRunDetail[]): LoopEvalCase[] {
    return runs.map((r) => this.materialize(r)).filter((c): c is LoopEvalCase => c != null);
  }

  private classifyKind(
    status: string,
    stopReason: string | undefined,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    iterationCount: number,
  ): LoopEvalCaseKind | null {
    if (status === 'COMPLETED' && (stopReason === 'success_criteria_met' || stopReason === 'on_track')) {
      return 'GOLDEN';
    }

    if (
      status === 'FAILED' ||
      stopReason === 'no_progress_detected' ||
      stopReason === 'time_budget_exhausted'
    ) {
      return 'FAILURE';
    }

    if (status === 'WAITING_FOR_HUMAN' && stopReason === 'max_iterations_reached') {
      return 'REGRESSION';
    }

    if (
      status === 'WAITING_FOR_HUMAN' &&
      (stopReason === 'guardian_deferred' || stopReason === 'patches_ready_for_approval' || stopReason === 'plans_ready_for_approval')
    ) {
      return iterationCount <= 1 ? 'EDGE' : 'REGRESSION';
    }

    const beforeScore = typeof before.readinessScore === 'number' ? before.readinessScore : undefined;
    const afterScore = typeof after.readinessScore === 'number' ? after.readinessScore : undefined;
    if (beforeScore != null && afterScore != null && afterScore < beforeScore) {
      return 'FAILURE';
    }

    if (iterationCount === 0) return null;
    return 'EDGE';
  }

  private buildReplayExpectations(
    kind: LoopEvalCaseKind,
    loopType: LoopType,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): LoopEvalReplayExpectations {
    if (loopType === 'READINESS_REPAIR') {
      const beforeBlockers = typeof before.hardBlockers === 'number' ? before.hardBlockers : 0;
      const afterBlockers = typeof after.hardBlockers === 'number' ? after.hardBlockers : beforeBlockers;
      return {
        expectedStatus: kind === 'GOLDEN' ? 'COMPLETED' : 'WAITING_FOR_HUMAN',
        maxIterations: 5,
        minReadinessDelta: kind === 'GOLDEN' ? 0 : undefined,
        mustImproveBlockers: kind !== 'GOLDEN' && afterBlockers >= beforeBlockers,
      };
    }

    return {
      expectedStatus: kind === 'GOLDEN' ? 'COMPLETED' : 'WAITING_FOR_HUMAN',
      maxIterations: 3,
    };
  }

  newCaseId(): string {
    return `loop-eval-${randomUUID().slice(0, 8)}`;
  }
}
