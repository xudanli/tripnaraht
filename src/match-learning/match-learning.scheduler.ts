import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MatchLearningService } from './match-learning.service';

@Injectable()
export class MatchLearningScheduler {
  private readonly logger = new Logger(MatchLearningScheduler.name);

  constructor(private readonly matchLearning: MatchLearningService) {}

  /** PRD 5.3 — 每周一 04:00 UTC 微调 Soft Weights */
  @Cron('0 4 * * 1', { name: 'match-learning-weekly-weights', timeZone: 'UTC' })
  async runWeeklyWeightIteration(): Promise<void> {
    if (process.env.MATCH_LEARNING_CRON_ENABLED === 'false') {
      return;
    }

    try {
      const { applied, result } = await this.matchLearning.runWeeklyWeightIteration();
      this.logger.log(
        `[MatchLearning] cron done applied=${applied} pos=${result.positiveSamples} neg=${result.negativeSamples}`,
      );
    } catch (error: unknown) {
      this.logger.error(`[MatchLearning] cron failed: ${(error as Error).message}`);
    }
  }
}
