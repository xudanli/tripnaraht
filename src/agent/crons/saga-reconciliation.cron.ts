import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgentActionReconcilerService } from '../services/agent-action-reconciler.service';

@Injectable()
export class SagaReconciliationCron {
  private readonly logger = new Logger(SagaReconciliationCron.name);

  constructor(private readonly reconciler: AgentActionReconcilerService) {}

  /**
   * Every 1 minute.
   * Uses reconciler's internal stale window (5 minutes) to avoid in-flight interference.
   */
  @Cron('*/1 * * * *', { name: 'saga-reconciliation-1min', timeZone: 'UTC' })
  async handleTick(): Promise<void> {
    const res = await this.reconciler.reconcileOnce({ take: 100 });
    if (res.scanned || res.attempted || res.cleaned) {
      this.logger.log(
        `tick: scanned=${res.scanned}, attempted=${res.attempted}, cleaned=${res.cleaned}`,
      );
    }
  }
}

