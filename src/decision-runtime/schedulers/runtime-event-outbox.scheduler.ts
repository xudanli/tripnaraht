import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RuntimeEventOutboxService } from '../services/runtime-event-outbox.service';
import { isRuntimeEventOutboxEnabled } from '../decision-runtime.config';

@Injectable()
export class RuntimeEventOutboxScheduler {
  private readonly logger = new Logger(RuntimeEventOutboxScheduler.name);

  constructor(private readonly outbox: RuntimeEventOutboxService) {}

  /** Drain pending runtime events every minute (Tier 1.2). */
  @Cron('0 * * * * *', { name: 'runtime-event-outbox-drain' })
  async drainPending(): Promise<void> {
    if (!isRuntimeEventOutboxEnabled()) return;
    if (process.env.RUNTIME_OUTBOX_CRON_ENABLED === 'false') return;

    try {
      const result = await this.outbox.drainPending(50);
      if (result.published > 0 || result.failed > 0) {
        this.logger.log(
          `[RuntimeOutbox] drain: published=${result.published} failed=${result.failed} pending=${result.stillPending}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[RuntimeOutbox] drain job failed: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
