import { Injectable } from '@nestjs/common';
import { isDecisionLearningLoopEnabled, isTripCompletedLearningEnabled, tripCompletedLearningLimit } from '../loop-engineering.config';
import { DecisionLearningLoop } from '../loops/decision-learning.loop';

@Injectable()
export class LoopLearningBridgeService {
  constructor(private readonly learning: DecisionLearningLoop) {}

  async notifyLoopCompleted(input: {
    tripId: string;
    loopRunId: string;
    loopType: string;
    status: string;
    stopReason?: string;
    userId?: string;
  }): Promise<void> {
    if (!isDecisionLearningLoopEnabled()) return;

    const shouldMaterialize =
      input.status === 'FAILED' ||
      input.status === 'WAITING_FOR_HUMAN' ||
      input.stopReason === 'success_criteria_met' ||
      input.stopReason === 'on_track';

    if (!shouldMaterialize) return;

    await this.learning.run({
      tripId: input.tripId,
      loopRunId: input.loopRunId,
      limit: 1,
      userId: input.userId ?? 'system',
      skipExisting: true,
      runReplay: false,
    });
  }

  async notifyTripCompleted(input: { tripId: string; userId?: string }): Promise<void> {
    if (!isDecisionLearningLoopEnabled()) return;
    if (!isTripCompletedLearningEnabled()) return;

    await this.learning.run({
      tripId: input.tripId,
      limit: tripCompletedLearningLimit(),
      userId: input.userId ?? 'system',
      skipExisting: true,
      runReplay: false,
    });
  }
}
