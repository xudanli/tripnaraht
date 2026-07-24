import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IcelandPoiAccessSyncService } from '../services/iceland-poi-access-sync.service';
import { IcelandCapacitySyncService } from '../services/iceland-capacity-sync.service';

@Injectable()
export class IcelandPoiAccessSyncCron {
  private readonly logger = new Logger(IcelandPoiAccessSyncCron.name);
  private running = false;

  constructor(
    private readonly syncService: IcelandPoiAccessSyncService,
    private readonly capacitySync: IcelandCapacitySyncService,
  ) {}

  /** 每日 06:00 UTC 同步官方状态 + 预约库存 */
  @Cron('0 6 * * *', { name: 'iceland-poi-access-sync', timeZone: 'UTC' })
  async handleDailySync(): Promise<void> {
    if (process.env.ICELAND_POI_ACCESS_SYNC_ENABLED === 'false') {
      return;
    }
    if (this.running) {
      this.logger.debug('skip — previous sync still running');
      return;
    }

    this.running = true;
    try {
      const access = await this.syncService.syncAll();
      const capacity = await this.capacitySync.syncFromSeedFile();
      this.logger.log(
        `cron done vatnajokull=${access.vatnajokull.overridesUpserted} dyrholaey=${access.dyrholaey.overridesUpserted} capacity=${capacity.snapshotsUpserted}`,
      );
    } catch (err) {
      this.logger.error(`cron failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
