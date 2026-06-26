import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { LoopRunRepository } from '../services/loop-run.repository';
import { LoopEvalCaseMaterializerService } from '../services/loop-eval-case.materializer.service';
import { LoopEvalCaseStorageService } from '../services/loop-eval-case.storage.service';
import { LoopEvalReplayService } from '../services/loop-eval-replay.service';
import { LoopEventEmitterService } from '../services/loop-event-emitter.service';
import type { DecisionLearningLoopResult } from '../types/loop-eval-case.types';
import type { LoopType } from '../types/loop-definition.types';

export interface RunDecisionLearningInput {
  tripId?: string;
  loopRunId?: string;
  loopTypes?: LoopType[];
  limit?: number;
  userId?: string;
  runReplay?: boolean;
  skipExisting?: boolean;
}

@Injectable()
export class DecisionLearningLoop {
  private readonly logger = new Logger(DecisionLearningLoop.name);

  constructor(
    private readonly repository: LoopRunRepository,
    private readonly materializer: LoopEvalCaseMaterializerService,
    private readonly storage: LoopEvalCaseStorageService,
    @Inject(forwardRef(() => LoopEvalReplayService))
    private readonly replay: LoopEvalReplayService,
    @Optional() private readonly loopEvents?: LoopEventEmitterService,
  ) {}

  async run(input: RunDecisionLearningInput): Promise<DecisionLearningLoopResult> {
    const learningRunId = `loop_learning_${Date.now()}`;
    const runs = await this.repository.listRecentRuns({
      tripId: input.tripId,
      loopRunId: input.loopRunId,
      loopTypes: input.loopTypes ?? ['READINESS_REPAIR', 'IN_TRIP_RECOVERY'],
      limit: input.limit ?? 20,
    });

    const materialized = [];
    const skipped: DecisionLearningLoopResult['skipped'] = [];

    for (const run of runs) {
      if (input.skipExisting !== false && (await this.storage.existsForLoopRun(run.id))) {
        skipped.push({ loopRunId: run.id, reason: 'already_materialized' });
        continue;
      }

      if (!['COMPLETED', 'FAILED', 'WAITING_FOR_HUMAN'].includes(run.status)) {
        skipped.push({ loopRunId: run.id, reason: 'status_not_terminal' });
        continue;
      }

      const detail = await this.repository.findRunWithIterations(run.id);
      if (!detail) {
        skipped.push({ loopRunId: run.id, reason: 'detail_not_found' });
        continue;
      }

      const evalCase = this.materializer.materialize(detail);
      if (!evalCase) {
        skipped.push({ loopRunId: run.id, reason: 'not_classifiable' });
        continue;
      }

      await this.storage.saveCase(evalCase);
      materialized.push(evalCase);
    }

    const replaySummary = [];
    if (input.runReplay && input.userId) {
      for (const evalCase of materialized.slice(0, 3)) {
        const result = await this.replay.replayCase(evalCase, input.userId);
        replaySummary.push(result);
      }
    }

    if (input.tripId && this.loopEvents) {
      const ctx = this.loopEvents.createContext({
        loopRunId: learningRunId,
        loopType: 'PRODUCT_IMPROVEMENT',
      });
      await this.loopEvents.emitLoopCompleted(
        input.tripId,
        ctx,
        {
          status: 'COMPLETED',
          requiresApproval: false,
          iterationCount: materialized.length,
          before: { candidates: runs.length },
          after: { materialized: materialized.length, skipped: skipped.length },
          stopReason: 'learning_materialized',
        },
      );
    }

    this.logger.log(
      `Decision learning materialized ${materialized.length} cases, skipped ${skipped.length}`,
    );

    return {
      loopRunId: learningRunId,
      status: 'COMPLETED',
      materialized,
      skipped,
      replaySummary: replaySummary.length > 0 ? replaySummary : undefined,
    };
  }
}
