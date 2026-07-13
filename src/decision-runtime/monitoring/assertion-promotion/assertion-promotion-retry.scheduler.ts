import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  isAssertionPromotionEnabled,
  parseAssertionPromotionTripAllowlist,
  resolveAssertionPromotionRetryCronExpression,
} from './assertion-promotion.config';
import { AssertionPromotionService } from './assertion-promotion.service';

@Injectable()
export class AssertionPromotionRetryScheduler {
  private readonly logger = new Logger(AssertionPromotionRetryScheduler.name);

  constructor(@Optional() private readonly promotion?: AssertionPromotionService) {}

  /** Retry failed promotion ledger entries (5 min prod; faster when test failpoint on). */
  @Cron(resolveAssertionPromotionRetryCronExpression(), {
    name: 'assertion-promotion-retry',
    timeZone: 'UTC',
  })
  async retryFailedPromotions(): Promise<void> {
    if (!isAssertionPromotionEnabled() || !this.promotion?.isEnabled()) {
      return;
    }
    if (process.env.ASSERTION_PROMOTION_RETRY_CRON_ENABLED === '0') {
      return;
    }

    const allowlist = parseAssertionPromotionTripAllowlist();
    for (const tripId of allowlist) {
      try {
        const results = await this.promotion.retryFailedForTrip(tripId);
        const retried = results.filter((r) => r.status !== 'SKIPPED').length;
        if (retried > 0) {
          this.logger.log(
            `[AssertionPromotionRetry] trip=${tripId} retried=${retried}`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[AssertionPromotionRetry] trip=${tripId} failed: ${message}`);
      }
    }
  }
}
