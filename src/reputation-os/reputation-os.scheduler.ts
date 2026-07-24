import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReputationOsService } from './reputation-os.service';

@Injectable()
export class ReputationOsScheduler {
  private readonly logger = new Logger(ReputationOsScheduler.name);

  constructor(private readonly reputationOs: ReputationOsService) {}

  /** PRD 5.1 — 行程 endDate + 48h 后创建互评活动 */
  @Cron(CronExpression.EVERY_HOUR, { name: 'reputation-os-campaign-bootstrap', timeZone: 'UTC' })
  async bootstrapDueCampaigns(): Promise<void> {
    try {
      const created = await this.reputationOs.createDueCampaigns(50);
      if (created > 0) {
        this.logger.log(`[ReputationOS] bootstrap created=${created} campaigns`);
      }
    } catch (error: unknown) {
      this.logger.error(`[ReputationOS] bootstrap failed: ${(error as Error).message}`);
    }
  }
}
